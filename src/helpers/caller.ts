import LOGGER from '../services/logging_service.js';
import dns from 'dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';

export type ResponseType = 'json' | 'binary';

/**
 * Raw body returned when `responseType` is `'binary'`.
 */
export interface BinaryResponse {
    data: Buffer;
    contentType: string | null;
}

const MAX_ERROR_BODY_LENGTH = 500;
const BINARY_CONTENT_TYPE = /^(?:image|video|audio)\/|^application\/octet-stream/i;

/**
 * Lightweight HTTP client wrapper around `fetch` used by BongBot modules.
 *
 * Provides a small convenience surface (`get`/`post`) and an SSRF validator
 * for safely contacting user-supplied server URLs (e.g. Pterodactyl panels).
 *
 * Responses with a `2xx` status are parsed as JSON, or returned as raw bytes
 * when `responseType` is `'binary'`; `204` / empty responses return `null`;
 * non-`ok` responses throw with the status and body text.
 */
export class Caller {
    /**
     * Validates a user-supplied server URL against SSRF attack vectors.
     *
     * Enforces that the URL is well-formed, uses HTTPS, resolves to a public
     * IP (not private/loopback/link-local/etc.), and — if
     * `PTERODACTYL_ALLOWED_HOSTS` is set — that its hostname is on the
     * allowlist.
     *
     * @param serverUrl The URL to validate.
     * @throws {Error} If the URL fails any of the safety checks.
     */
    async validateServerSSRF(serverUrl: string): Promise<void> {
        await validateServerUrl(serverUrl);
    }

    /**
     * Performs an HTTP GET request and returns the parsed JSON body.
     *
     * @param url      Base URL.
     * @param path     Optional path appended to the base URL.
     * @param params   Optional pre-encoded query string (no leading `?`).
     * @param headers  Optional request headers.
     * @param responseType `'binary'` returns a {@link BinaryResponse} instead of parsed JSON.
     * @returns The parsed JSON body, a {@link BinaryResponse}, or `null` for empty responses.
     * @throws {Error} When the response status is not OK.
     */
    async get(
        url: string,
        path?: string | null,
        params?: string | null,
        headers?: { [key: string]: any },
        responseType: ResponseType = 'json'
    ) {
        return await get(url, path, params, headers, responseType);
    }

    /**
     * Performs an HTTP POST request with a JSON-serialized body.
     *
     * @param url      Base URL.
     * @param path     Optional path appended to the base URL.
     * @param headers  Optional request headers. Remember to include
     *                 `'Content-Type': 'application/json'` if the remote requires it.
     * @param body     Value passed through `JSON.stringify` before sending.
     * @returns The parsed JSON body, or `null` for empty responses.
     * @throws {Error} When the response status is not OK.
     */
    async post(url: string, path?: string | null, headers?: { [key: string]: any } | null, body?: any) {
        return await post(url, path, headers, body);
    }
}

/**
 * Default export exposes a functional GET/POST surface for callers that do
 * not need an instance (e.g. `import Caller from 'bongbot-core'; Caller.get(...)`).
 */
export default { get, post };

async function get(
    url: string,
    path?: string | null,
    params?: string | null,
    headers?: { [key: string]: any },
    responseType: ResponseType = 'json'
) {
    const config = {
        method: 'GET',
        headers: headers,
    };
    return await makeCallout(constructFullPath(url, path, params), config, responseType);
}
async function post(url: string, path?: string | null, headers?: { [key: string]: any } | null, body?: any) {
    const config = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
    };
    return await makeCallout(constructFullPath(url, path), config);
}

function constructFullPath(url: string, path?: string | null, params?: string | null) {
    return `${url}${path ?? ''}${params ? `?${params}` : ''}`;
}

async function makeCallout(
    url: string,
    config: { [key: string]: any },
    responseType: ResponseType = 'json'
): Promise<any> {
    let text: string | null;
    let resp = await fetch(url, config)
        .then(async (response) => {
            if (response.ok) {
                const contentLength = response.headers.get('content-length');
                if (response.status === 204 || contentLength === '0') {
                    return null;
                }
                if (responseType === 'binary') {
                    return {
                        data: Buffer.from(await response.arrayBuffer()),
                        contentType: response.headers.get('content-type'),
                    };
                }
                return await response.json();
            }
            text = await describeErrorBody(response);
            throw new Error(`Network response was not ok: ${response.status} ${response.statusText} ${text}`);
        })
        .finally(() => {
            if (text) {
                LOGGER.log(`${text}`);
            }
        });
    return resp;
}

/**
 * Keeps binary bodies and oversized pages out of the thrown error and the log.
 */
async function describeErrorBody(response: Response): Promise<string> {
    const contentType = response.headers.get('content-type');
    if (contentType && BINARY_CONTENT_TYPE.test(contentType)) {
        return `<${contentType} body, ${response.headers.get('content-length') ?? 'unknown'} bytes>`;
    }
    const body = await response.text();
    if (body.length <= MAX_ERROR_BODY_LENGTH) {
        return body;
    }
    return `${body.slice(0, MAX_ERROR_BODY_LENGTH)}... (truncated)`;
}

async function validateServerUrl(serverUrl: string): Promise<void> {
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(serverUrl);
    } catch {
        throw new Error('Invalid server URL format.');
    }

    if (parsedUrl.protocol !== 'https:') {
        throw new Error('Server URL must use HTTPS protocol.');
    }

    const allowedHosts = process.env.PTERODACTYL_ALLOWED_HOSTS;
    if (allowedHosts) {
        const allowedList = allowedHosts.split(',').map((h) => h.trim().toLowerCase());
        if (!allowedList.includes(parsedUrl.hostname.toLowerCase())) {
            throw new Error('Server URL hostname is not in the allowed hosts list.');
        }
    }

    const addresses = await resolveHostnameToIPs(parsedUrl);

    if (addresses.length === 0) {
        throw new Error('Unable to resolve server hostname.');
    }

    for (const ip of addresses) {
        if (isPrivateOrReservedIP(ip)) {
            throw new Error('Server URL resolves to a private or reserved IP address.');
        }
    }
}

async function resolveHostnameToIPs(parsedUrl: URL): Promise<string[]> {
    let addresses: string[];
    if (net.isIP(parsedUrl.hostname)) {
        addresses = [parsedUrl.hostname];
    } else {
        const [ipv4Result, ipv6Result] = await Promise.allSettled([
            dns.resolve4(parsedUrl.hostname),
            dns.resolve6(parsedUrl.hostname),
        ]);
        const ipv4Addresses = ipv4Result.status === 'fulfilled' ? ipv4Result.value : [];
        const ipv6Addresses = ipv6Result.status === 'fulfilled' ? ipv6Result.value : [];
        addresses = [...ipv4Addresses, ...ipv6Addresses];
    }
    return addresses;
}

function isPrivateOrReservedIP(ip: string): boolean {
    try {
        const addr = ipaddr.process(ip);
        const range = addr.range();

        const blockedRanges = [
            'private',
            'uniqueLocal',
            'loopback',
            'linkLocal',
            'reserved',
            'unspecified',
            'carrierGradeNat',
            'broadcast',
        ];

        return blockedRanges.includes(range);
    } catch (err) {
        return true;
    }
}

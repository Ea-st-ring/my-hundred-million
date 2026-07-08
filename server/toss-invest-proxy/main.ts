// 고정 IP가 필요한 토스증권 프록시. Supabase Edge Function은 아웃바운드 IP가
// 매번 바뀌어 토스의 IP 화이트리스트를 통과할 수 없어, 고정 IP 서버(Oracle Cloud 등)에서
// 이 파일을 직접 실행합니다. 로직은 supabase/functions/toss-invest-proxy와 동일합니다.
//
// 실행: deno run --allow-net --allow-env main.ts
// 필요한 환경변수: SUPABASE_URL, SUPABASE_ANON_KEY, PORT(기본 8000)

import { createClient } from "jsr:@supabase/supabase-js@2";

const TOSS_BASE_URL = "https://openapi.tossinvest.com";
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

const ALLOWED_ORIGINS = new Set([
	"https://ea-st-ring.github.io",
	"http://localhost:5173",
	"http://127.0.0.1:5173",
]);

type Action = "HOLDINGS" | "BUYING_POWER" | "PRICES" | "STOCK_INFO";

const SYMBOLS_PATTERN = /^[A-Za-z0-9.,-]{1,2000}$/;
const CURRENCIES = new Set(["KRW", "USD"]);

type RequestPayload = {
	action?: Action;
	params?: {
		symbol?: string;
		symbols?: string;
		currency?: string;
	};
};

class TossProxyError extends Error {
	status: number;
	code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

function corsHeadersFor(origin: string | null): Record<string, string> {
	const allowOrigin =
		origin !== null && ALLOWED_ORIGINS.has(origin) ? origin : "";
	return {
		"Access-Control-Allow-Origin": allowOrigin,
		"Access-Control-Allow-Headers":
			"authorization, x-client-info, apikey, content-type",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		Vary: "Origin",
	};
}

function jsonResponse(
	body: unknown,
	status: number,
	corsHeaders: Record<string, string>,
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...corsHeaders,
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}

type Credentials = {
	clientId: string;
	clientSecret: string;
	accountSeq: string;
};

async function resolveCredentials(request: Request): Promise<Credentials> {
	const authHeader = request.headers.get("Authorization");
	if (authHeader === null) {
		throw new TossProxyError(401, "unauthenticated", "로그인이 필요합니다.");
	}

	const supabaseUrl = Deno.env.get("SUPABASE_URL");
	const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
	if (supabaseUrl === undefined || supabaseAnonKey === undefined) {
		throw new TossProxyError(
			500,
			"internal-error",
			"SUPABASE_URL / SUPABASE_ANON_KEY 환경변수가 설정되지 않았습니다.",
		);
	}

	const userClient = createClient(supabaseUrl, supabaseAnonKey, {
		global: { headers: { Authorization: authHeader } },
	});

	const {
		data: { user },
		error: userError,
	} = await userClient.auth.getUser();
	if (userError !== null || user === null) {
		throw new TossProxyError(401, "unauthenticated", "로그인이 필요합니다.");
	}

	const { data: credRow, error: credError } = await userClient
		.from("toss_invest_credentials")
		.select("client_id, client_secret, account_seq")
		.eq("user_code", user.id)
		.maybeSingle();

	if (credError !== null) {
		throw new TossProxyError(500, "internal-error", credError.message);
	}
	if (credRow === null) {
		throw new TossProxyError(
			400,
			"credentials-not-found",
			"토스증권 연동 정보가 등록되지 않았습니다. 설정에서 먼저 등록해주세요.",
		);
	}

	return {
		clientId: credRow.client_id as string,
		clientSecret: credRow.client_secret as string,
		accountSeq: credRow.account_seq as string,
	};
}

type CachedToken = {
	accessToken: string;
	expiresAt: number;
};

const tokenCacheByClientId = new Map<string, CachedToken>();

async function fetchAccessToken(
	clientId: string,
	clientSecret: string,
): Promise<string> {
	const body = new URLSearchParams({
		grant_type: "client_credentials",
		client_id: clientId,
		client_secret: clientSecret,
	});
	const response = await fetch(`${TOSS_BASE_URL}/oauth2/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});
	const payload = (await response.json().catch(() => null)) as {
		access_token?: string;
		expires_in?: number;
		error?: string;
		error_description?: string;
	} | null;

	if (!response.ok || payload?.access_token === undefined) {
		const message =
			payload?.error_description ?? payload?.error ?? "토큰 발급 실패";
		throw new TossProxyError(
			502,
			"token-issue-failed",
			`토스증권 토큰 발급 실패: ${message}`,
		);
	}

	const expiresInMs = (payload.expires_in ?? 3600) * 1000;
	const token: CachedToken = {
		accessToken: payload.access_token,
		expiresAt: Date.now() + expiresInMs - TOKEN_REFRESH_MARGIN_MS,
	};
	tokenCacheByClientId.set(clientId, token);
	return token.accessToken;
}

async function getAccessToken(
	clientId: string,
	clientSecret: string,
): Promise<string> {
	const cached = tokenCacheByClientId.get(clientId);
	if (cached !== undefined && cached.expiresAt > Date.now()) {
		return cached.accessToken;
	}
	return fetchAccessToken(clientId, clientSecret);
}

type TossCallOptions = {
	path: string;
	searchParams?: Record<string, string>;
	requiresAccount: boolean;
};

async function callToss(
	{ path, searchParams, requiresAccount }: TossCallOptions,
	credentials: Credentials,
): Promise<Response> {
	const url = new URL(`${TOSS_BASE_URL}${path}`);
	for (const [key, value] of Object.entries(searchParams ?? {})) {
		url.searchParams.set(key, value);
	}

	const doFetch = async (token: string) =>
		fetch(url.toString(), {
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
				...(requiresAccount
					? { "X-Tossinvest-Account": credentials.accountSeq }
					: {}),
			},
		});

	const token = await getAccessToken(
		credentials.clientId,
		credentials.clientSecret,
	);
	let upstream = await doFetch(token);

	if (upstream.status === 401) {
		tokenCacheByClientId.delete(credentials.clientId);
		const refreshedToken = await getAccessToken(
			credentials.clientId,
			credentials.clientSecret,
		);
		upstream = await doFetch(refreshedToken);
	}

	return upstream;
}

function buildTossCall(
	action: Action,
	params: RequestPayload["params"],
): TossCallOptions {
	switch (action) {
		case "HOLDINGS": {
			const symbol = params?.symbol?.trim();
			return {
				path: "/api/v1/holdings",
				searchParams:
					symbol !== undefined && symbol.length > 0 ? { symbol } : undefined,
				requiresAccount: true,
			};
		}
		case "BUYING_POWER": {
			const currency = params?.currency?.trim().toUpperCase() ?? "";
			if (!CURRENCIES.has(currency)) {
				throw new TossProxyError(
					400,
					"invalid-request",
					"currency는 KRW 또는 USD여야 합니다.",
				);
			}
			return {
				path: "/api/v1/buying-power",
				searchParams: { currency },
				requiresAccount: true,
			};
		}
		case "PRICES": {
			const symbols = params?.symbols?.trim() ?? "";
			if (!SYMBOLS_PATTERN.test(symbols)) {
				throw new TossProxyError(
					400,
					"invalid-request",
					"symbols 형식이 올바르지 않습니다.",
				);
			}
			return {
				path: "/api/v1/prices",
				searchParams: { symbols },
				requiresAccount: false,
			};
		}
		case "STOCK_INFO": {
			const symbols = params?.symbols?.trim() ?? "";
			if (!SYMBOLS_PATTERN.test(symbols)) {
				throw new TossProxyError(
					400,
					"invalid-request",
					"symbols 형식이 올바르지 않습니다.",
				);
			}
			return {
				path: "/api/v1/stocks",
				searchParams: { symbols },
				requiresAccount: false,
			};
		}
		default:
			throw new TossProxyError(
				400,
				"invalid-request",
				"지원하지 않는 action입니다.",
			);
	}
}

const PASSTHROUGH_HEADERS = [
	"x-ratelimit-limit",
	"x-ratelimit-remaining",
	"x-ratelimit-reset",
	"retry-after",
	"x-request-id",
];

async function handler(request: Request): Promise<Response> {
	const origin = request.headers.get("origin");
	const corsHeaders = corsHeadersFor(origin);

	if (request.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}

	if (request.method !== "POST") {
		return jsonResponse({ message: "Method Not Allowed" }, 405, corsHeaders);
	}

	let payload: RequestPayload = {};
	try {
		payload = (await request.json()) as RequestPayload;
	} catch {
		return jsonResponse({ message: "Invalid JSON payload." }, 400, corsHeaders);
	}

	const action = payload.action;
	if (
		action !== "HOLDINGS" &&
		action !== "BUYING_POWER" &&
		action !== "PRICES" &&
		action !== "STOCK_INFO"
	) {
		return jsonResponse({ message: "Unsupported action." }, 400, corsHeaders);
	}

	try {
		const credentials = await resolveCredentials(request);
		const callOptions = buildTossCall(action, payload.params);
		const upstream = await callToss(callOptions, credentials);
		const text = await upstream.text();

		const responseHeaders: Record<string, string> = {
			...corsHeaders,
			"Content-Type":
				upstream.headers.get("content-type") ??
				"application/json; charset=utf-8",
		};
		for (const headerName of PASSTHROUGH_HEADERS) {
			const value = upstream.headers.get(headerName);
			if (value !== null) {
				responseHeaders[headerName] = value;
			}
		}

		return new Response(text, {
			status: upstream.status,
			headers: responseHeaders,
		});
	} catch (error) {
		if (error instanceof TossProxyError) {
			return jsonResponse(
				{ error: { code: error.code, message: error.message } },
				error.status,
				corsHeaders,
			);
		}
		const message =
			error instanceof Error ? error.message : "Unknown proxy error";
		return jsonResponse({ message }, 502, corsHeaders);
	}
}

const port = Number.parseInt(Deno.env.get("PORT") ?? "8000", 10);
Deno.serve({ port, hostname: "127.0.0.1" }, handler);

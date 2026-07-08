import { assertSupabase } from "@/lib/supabase";
import type { TossApiErrorEnvelope } from "@/lib/toss-invest/types";

export class TossInvestError extends Error {
	code: string;

	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

type TossAction = "HOLDINGS" | "BUYING_POWER" | "PRICES" | "STOCK_INFO";

type TossSuccessEnvelope<T> = {
	result: T;
};

const PROXY_URL = import.meta.env.VITE_TOSS_INVEST_PROXY_URL as
	| string
	| undefined;

function isErrorEnvelope(value: unknown): value is TossApiErrorEnvelope {
	return (
		value !== null &&
		typeof value === "object" &&
		"error" in (value as Record<string, unknown>)
	);
}

export async function invokeTossInvest<T>(
	action: TossAction,
	params?: Record<string, string>,
): Promise<T> {
	if (PROXY_URL === undefined || PROXY_URL.trim().length === 0) {
		throw new TossInvestError(
			"proxy-not-configured",
			"VITE_TOSS_INVEST_PROXY_URL이 설정되지 않았습니다.",
		);
	}

	const client = assertSupabase();
	const {
		data: { session },
	} = await client.auth.getSession();
	if (session === null) {
		throw new TossInvestError("unauthenticated", "로그인이 필요합니다.");
	}

	const response = await fetch(PROXY_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${session.access_token}`,
		},
		body: JSON.stringify({ action, params }),
	}).catch((cause) => {
		throw new TossInvestError(
			"network-error",
			`토스증권 연동 서버에 연결할 수 없습니다: ${
				cause instanceof Error ? cause.message : String(cause)
			}`,
		);
	});

	const payload = (await response.json().catch(() => null)) as unknown;

	if (!response.ok) {
		if (isErrorEnvelope(payload)) {
			throw new TossInvestError(payload.error.code, payload.error.message);
		}
		const message =
			payload !== null &&
			typeof payload === "object" &&
			"message" in (payload as Record<string, unknown>)
				? String((payload as Record<string, unknown>).message)
				: `HTTP ${response.status}`;
		throw new TossInvestError(
			"proxy-error",
			`토스증권 연동 호출 실패: ${message}`,
		);
	}

	if (isErrorEnvelope(payload)) {
		throw new TossInvestError(payload.error.code, payload.error.message);
	}

	return (payload as TossSuccessEnvelope<T>).result;
}

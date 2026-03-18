const KRX_BASE_URL = "https://data-dbg.krx.co.kr/svc/apis";

const API_PATH_BY_ID: Record<string, "sto" | "etp"> = {
	stk_isu_base_info: "sto",
	ksq_isu_base_info: "sto",
	knx_isu_base_info: "sto",
	stk_bydd_trd: "sto",
	ksq_bydd_trd: "sto",
	knx_bydd_trd: "sto",
	etf_bydd_trd: "etp",
	etn_bydd_trd: "etp",
	elw_bydd_trd: "etp",
};

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...corsHeaders,
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}

Deno.serve(async (request) => {
	if (request.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}

	if (request.method !== "POST") {
		return jsonResponse({ message: "Method Not Allowed" }, 405);
	}

	const apiKey = Deno.env.get("KRX_API_KEY");
	if (apiKey === undefined || apiKey.trim().length === 0) {
		return jsonResponse(
			{ message: "KRX_API_KEY secret is not configured." },
			500,
		);
	}

	let payload: { apiId?: string; basDd?: string } = {};
	try {
		payload = (await request.json()) as { apiId?: string; basDd?: string };
	} catch {
		return jsonResponse({ message: "Invalid JSON payload." }, 400);
	}

	const apiId = payload.apiId?.trim() ?? "";
	const basDd = payload.basDd?.trim() ?? "";
	const apiPath = API_PATH_BY_ID[apiId];
	if (apiPath === undefined) {
		return jsonResponse({ message: "Unsupported apiId." }, 400);
	}
	if (!/^\d{8}$/.test(basDd)) {
		return jsonResponse({ message: "Invalid basDd format." }, 400);
	}

	const url = new URL(`${KRX_BASE_URL}/${apiPath}/${apiId}`);
	url.searchParams.set("basDd", basDd);

	try {
		const upstream = await fetch(url.toString(), {
			method: "GET",
			headers: {
				AUTH_KEY: apiKey,
			},
		});
		const text = await upstream.text();
		return new Response(text, {
			status: upstream.status,
			headers: {
				...corsHeaders,
				"Content-Type":
					upstream.headers.get("content-type") ??
					"application/json; charset=utf-8",
			},
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown proxy error";
		return jsonResponse({ message }, 502);
	}
});

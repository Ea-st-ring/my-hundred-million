import { assertSupabase } from "@/lib/supabase";

export type TossCredentialStatus = {
	clientId: string;
	accountSeq: string;
	updatedAt: string;
};

type TossCredentialStatusRow = {
	client_id: string;
	account_seq: string;
	updated_at: string;
};

async function requireUserId(): Promise<string> {
	const client = assertSupabase();
	const {
		data: { user },
		error,
	} = await client.auth.getUser();
	if (error !== null || user === null) {
		throw new Error("로그인이 필요합니다.");
	}
	return user.id;
}

export async function fetchTossCredentialStatus(): Promise<TossCredentialStatus | null> {
	const client = assertSupabase();
	const { data, error } = await client
		.from("toss_invest_credentials")
		.select("client_id, account_seq, updated_at")
		.maybeSingle<TossCredentialStatusRow>();

	if (error !== null) {
		throw new Error(error.message);
	}
	if (data === null) {
		return null;
	}
	return {
		clientId: data.client_id,
		accountSeq: data.account_seq,
		updatedAt: data.updated_at,
	};
}

export type SaveTossCredentialsInput = {
	clientId: string;
	clientSecret: string;
	accountSeq: string;
};

export async function saveTossCredentials(
	input: SaveTossCredentialsInput,
): Promise<void> {
	const client = assertSupabase();
	const userId = await requireUserId();
	const { error } = await client.from("toss_invest_credentials").upsert(
		{
			user_code: userId,
			client_id: input.clientId,
			client_secret: input.clientSecret,
			account_seq: input.accountSeq,
		},
		{ onConflict: "user_code" },
	);
	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function deleteTossCredentials(): Promise<void> {
	const client = assertSupabase();
	const userId = await requireUserId();
	const { error } = await client
		.from("toss_invest_credentials")
		.delete()
		.eq("user_code", userId);
	if (error !== null) {
		throw new Error(error.message);
	}
}

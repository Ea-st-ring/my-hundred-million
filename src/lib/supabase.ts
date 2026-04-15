import { createClient, type User } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseEnv =
	typeof supabaseUrl === "string" &&
	supabaseUrl.length > 0 &&
	typeof supabaseAnonKey === "string" &&
	supabaseAnonKey.length > 0;

export const supabase = hasSupabaseEnv
	? createClient(supabaseUrl, supabaseAnonKey)
	: null;

export function assertSupabase() {
	if (supabase === null) {
		throw new Error(
			"Supabase 환경변수가 없습니다. VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 설정하세요.",
		);
	}
	return supabase;
}

export function getAuthRedirectUrl() {
	if (typeof window === "undefined") {
		return undefined;
	}
	return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export async function signInWithKakao() {
	const client = assertSupabase();
	const { error } = await client.auth.signInWithOAuth({
		provider: "kakao",
		options: {
			redirectTo: getAuthRedirectUrl(),
		},
	});

	if (error !== null) {
		throw new Error(error.message);
	}
}

export async function signOutSupabase() {
	const client = assertSupabase();
	const { error } = await client.auth.signOut();
	if (error !== null) {
		throw new Error(error.message);
	}
}

export function getUserDisplayName(user: User | null) {
	if (user === null) {
		return "";
	}

	const metadata = user.user_metadata;
	if (typeof metadata?.name === "string" && metadata.name.trim().length > 0) {
		return metadata.name.trim();
	}
	if (
		typeof metadata?.full_name === "string" &&
		metadata.full_name.trim().length > 0
	) {
		return metadata.full_name.trim();
	}
	if (
		typeof metadata?.nickname === "string" &&
		metadata.nickname.trim().length > 0
	) {
		return metadata.nickname.trim();
	}
	if (typeof user.email === "string" && user.email.trim().length > 0) {
		return user.email.trim();
	}

	return `${user.id.slice(0, 8)}...`;
}

import { createClient } from "@supabase/supabase-js";

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

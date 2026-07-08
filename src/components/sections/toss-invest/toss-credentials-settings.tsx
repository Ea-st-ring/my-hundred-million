import { useState } from "react";

import { LayerModal } from "@/components/common/layer-modal";
import { Button } from "@/components/ui/button";
import {
	deleteTossCredentials,
	saveTossCredentials,
	type TossCredentialStatus,
} from "@/lib/toss-invest/credentials";

type TossCredentialsSettingsModalProps = {
	open: boolean;
	status: TossCredentialStatus | null;
	onClose: () => void;
	onSaved: (nextStatus: TossCredentialStatus) => void;
	onDeleted: () => void;
};

export function TossCredentialsSettingsModal({
	open,
	status,
	onClose,
	onSaved,
	onDeleted,
}: TossCredentialsSettingsModalProps) {
	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");
	const [accountSeq, setAccountSeq] = useState("");
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSave() {
		if (
			clientId.trim().length === 0 ||
			clientSecret.trim().length === 0 ||
			accountSeq.trim().length === 0
		) {
			setError("client_id, client_secret, accountSeq를 모두 입력해주세요.");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			await saveTossCredentials({
				clientId: clientId.trim(),
				clientSecret: clientSecret.trim(),
				accountSeq: accountSeq.trim(),
			});
			onSaved({
				clientId: clientId.trim(),
				accountSeq: accountSeq.trim(),
				updatedAt: new Date().toISOString(),
			});
			setClientId("");
			setClientSecret("");
			setAccountSeq("");
			onClose();
		} catch (thrown) {
			setError(
				thrown instanceof Error
					? thrown.message
					: "저장 중 오류가 발생했습니다.",
			);
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete() {
		setDeleting(true);
		setError(null);
		try {
			await deleteTossCredentials();
			onDeleted();
			onClose();
		} catch (thrown) {
			setError(
				thrown instanceof Error
					? thrown.message
					: "삭제 중 오류가 발생했습니다.",
			);
		} finally {
			setDeleting(false);
		}
	}

	return (
		<LayerModal
			open={open}
			title="토스증권 Open API 연동 설정"
			onClose={onClose}
		>
			<p className="text-sm text-slate-600">
				토스증권 개발자센터에서 발급받은 client_id, client_secret과 본인 계좌의
				accountSeq를 입력합니다. 로그인한 계정에만 연결되며, 다른 사용자는
				조회할 수 없습니다.
			</p>

			{status !== null ? (
				<div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
					<p>
						현재 등록된 client_id:{" "}
						<span className="font-mono">{status.clientId}</span>
					</p>
					<p>
						accountSeq: <span className="font-mono">{status.accountSeq}</span>
					</p>
					<p>
						마지막 업데이트:{" "}
						{new Date(status.updatedAt).toLocaleString("ko-KR")}
					</p>
				</div>
			) : (
				<p className="mt-3 text-xs text-amber-700">
					아직 등록된 연동 정보가 없습니다.
				</p>
			)}

			<div className="mt-4 grid gap-3">
				<div>
					<label className="mb-1 block text-xs font-medium">client_id</label>
					<input
						type="text"
						value={clientId}
						onChange={(event) => setClientId(event.target.value)}
						placeholder={status?.clientId ?? "c_..."}
						className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
					/>
				</div>
				<div>
					<label className="mb-1 block text-xs font-medium">
						client_secret
					</label>
					<input
						type="password"
						value={clientSecret}
						onChange={(event) => setClientSecret(event.target.value)}
						placeholder="s_..."
						className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
					/>
				</div>
				<div>
					<label className="mb-1 block text-xs font-medium">accountSeq</label>
					<input
						type="text"
						value={accountSeq}
						onChange={(event) => setAccountSeq(event.target.value)}
						placeholder={status?.accountSeq ?? "1"}
						className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
					/>
				</div>
			</div>

			{error !== null ? (
				<p className="mt-3 text-sm text-rose-600">{error}</p>
			) : null}

			<div className="mt-5 flex justify-between gap-2">
				{status !== null ? (
					<Button
						type="button"
						variant="outline"
						onClick={() => void handleDelete()}
						disabled={saving || deleting}
					>
						{deleting ? "삭제 중..." : "연동 해제"}
					</Button>
				) : (
					<span />
				)}
				<Button
					type="button"
					onClick={() => void handleSave()}
					disabled={saving || deleting}
				>
					{saving ? "저장 중..." : "저장"}
				</Button>
			</div>
		</LayerModal>
	);
}

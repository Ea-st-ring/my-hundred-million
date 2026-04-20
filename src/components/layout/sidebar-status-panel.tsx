import { Button } from "@/components/ui/button";

type SidebarStatusPanelProps = {
	userDisplayName: string;
	usdKrwLabel: string;
	onOpenStatusModal: () => void;
	onRefreshFxRate: () => void;
	loadingFxRate: boolean;
	onRefreshQuotes: () => void;
	loadingQuotes: boolean;
	hasStockApiKey: boolean;
	onSignOut: () => void;
	authActionPending: boolean;
};

export function SidebarStatusPanel({
	userDisplayName,
	usdKrwLabel,
	onOpenStatusModal,
	onRefreshFxRate,
	loadingFxRate,
	onRefreshQuotes,
	loadingQuotes,
	hasStockApiKey,
	onSignOut,
	authActionPending,
}: SidebarStatusPanelProps) {
	return (
		<>
			<h2 className="text-base font-semibold">5. 시스템 상태</h2>
			<p className="mt-2 text-sm text-slate-600">
				연동 상태와 빠른 갱신 액션을 확인합니다.
			</p>
			<div className="mt-4 grid gap-3">
				<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
					<p className="text-xs text-slate-500">카카오 계정</p>
					<p className="mt-1 text-sm font-semibold">{userDisplayName}</p>
				</div>
				<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
					<p className="text-xs text-slate-500">환율(USD/KRW)</p>
					<p className="mt-1 text-sm font-semibold">{usdKrwLabel}</p>
				</div>
			</div>
			<div className="mt-4 grid gap-2">
				<Button type="button" variant="outline" onClick={onOpenStatusModal}>
					상태
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={onRefreshFxRate}
					disabled={loadingFxRate}
				>
					{loadingFxRate ? "환율 갱신 중..." : "환율 새로고침"}
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={onRefreshQuotes}
					disabled={loadingQuotes || !hasStockApiKey}
				>
					{loadingQuotes ? "현재가 갱신 중..." : "현재가 새로고침"}
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={onSignOut}
					disabled={authActionPending}
				>
					로그아웃
				</Button>
			</div>
		</>
	);
}

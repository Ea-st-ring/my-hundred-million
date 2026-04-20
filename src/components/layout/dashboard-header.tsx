type AppTab = "DASHBOARD" | "YEARLY_SETTLEMENT";

type DashboardHeaderProps = {
	activeTab: AppTab;
	selectedMonthLabel: string;
	selectedYearText: string;
	usdKrwLabel: string;
};

export function DashboardHeader({
	activeTab,
	selectedMonthLabel,
	selectedYearText,
	usdKrwLabel,
}: DashboardHeaderProps) {
	return (
		<header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
			<p className="text-sm text-slate-500">my-hundred-million</p>
			<h1 className="mt-2 text-2xl font-semibold md:text-3xl">
				{activeTab === "DASHBOARD" ? "자산 현황 대시보드" : "연말 결산"}
			</h1>
			<p className="mt-3 text-sm text-slate-600">
				{activeTab === "DASHBOARD"
					? `${selectedMonthLabel} 기준으로 월급, 지출, 주식 모으기, 적금을 관리하고 월 잔액을 확인합니다.`
					: `${selectedYearText}년 1월부터 12월까지 결산 통계를 확인합니다.`}
			</p>
			<div className="mt-4 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
				<p>환율(USD/KRW): {usdKrwLabel}</p>
			</div>
		</header>
	);
}

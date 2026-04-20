import { SummaryCard } from "@/components/common/summary-card";
import { formatKrw } from "@/lib/format";

type SidebarMonthlyOverviewProps = {
	salary: number;
	incomeTotal: number;
	fixedExpenseTotal: number;
	variableExpenseTotal: number;
	consumptionExpenseTotal: number;
	installmentMonthlyTotal: number;
	stockMonthlyTotal: number;
	monthlyRemaining: number;
};

export function SidebarMonthlyOverview({
	salary,
	incomeTotal,
	fixedExpenseTotal,
	variableExpenseTotal,
	consumptionExpenseTotal,
	installmentMonthlyTotal,
	stockMonthlyTotal,
	monthlyRemaining,
}: SidebarMonthlyOverviewProps) {
	return (
		<>
			<h2 className="text-base font-semibold">4. 월 잔액 요약</h2>
			<p className="mt-2 text-xs text-slate-600">
				공식: 월급 + 수입 - (고정지출 + 비고정지출 + 적금 월 고정지출 + 주식
				모으기 월 고정지출)
			</p>
			<div className="mt-3 grid gap-2">
				<SummaryCard label="월급" value={salary} />
				<SummaryCard label="수입(자동합산)" value={incomeTotal} />
				<SummaryCard label="고정지출" value={fixedExpenseTotal} />
				<SummaryCard label="비고정지출" value={variableExpenseTotal} />
				<SummaryCard
					label="소비 지출(자동합산)"
					value={consumptionExpenseTotal}
				/>
				<SummaryCard label="적금 월 고정지출" value={installmentMonthlyTotal} />
				<SummaryCard
					label="주식 모으기 월 고정지출"
					value={stockMonthlyTotal}
				/>
			</div>
			<div
				className={`mt-3 rounded-xl p-3 text-center text-base font-semibold ${
					monthlyRemaining >= 0
						? "bg-emerald-100 text-emerald-800"
						: "bg-rose-100 text-rose-800"
				}`}
			>
				월 잔액: {formatKrw(monthlyRemaining)}
			</div>
		</>
	);
}

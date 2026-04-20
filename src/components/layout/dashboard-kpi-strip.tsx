import { CurrencyInput } from "@/components/common/currency-input";
import { DashboardStatCard } from "@/components/common/dashboard-stat-card";
import { Button } from "@/components/ui/button";
import { formatKrw } from "@/lib/format";

type DashboardKpiStripProps = {
	monthlyRemaining: number;
	fixedExpenseTotal: number;
	variableExpenseTotal: number;
	installmentMonthlyTotal: number;
	stockMonthlyTotal: number;
	salary: number;
	onChangeSalary: (value: number) => void;
	onSaveSalary: () => void;
	savingOverviewState: boolean;
};

export function DashboardKpiStrip({
	monthlyRemaining,
	fixedExpenseTotal,
	variableExpenseTotal,
	installmentMonthlyTotal,
	stockMonthlyTotal,
	salary,
	onChangeSalary,
	onSaveSalary,
	savingOverviewState,
}: DashboardKpiStripProps) {
	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<DashboardStatCard
				title="월 잔액"
				value={formatKrw(monthlyRemaining)}
				emphasis={monthlyRemaining >= 0 ? "positive" : "negative"}
			/>
			<DashboardStatCard
				title="월 지출 합계"
				value={formatKrw(fixedExpenseTotal + variableExpenseTotal)}
			/>
			<DashboardStatCard
				title="월 저축 합계"
				value={formatKrw(installmentMonthlyTotal + stockMonthlyTotal)}
			/>
			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<p className="text-xs text-slate-500">월급</p>
				<div className="mt-2 flex items-center gap-2">
					<CurrencyInput value={salary} onChange={onChangeSalary} />
					<Button
						type="button"
						onClick={onSaveSalary}
						disabled={savingOverviewState}
						className="shrink-0"
					>
						{savingOverviewState ? "저장 중..." : "저장"}
					</Button>
				</div>
				<p className="mt-2 text-xs text-slate-500">{formatKrw(salary)}</p>
			</div>
		</div>
	);
}

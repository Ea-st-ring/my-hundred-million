import type { ChartData, ChartOptions } from "chart.js";
import { Doughnut } from "react-chartjs-2";

import { DashboardStatCard } from "@/components/common/dashboard-stat-card";
import { formatKrw } from "@/lib/format";

type SavingCompositionItem = {
	label: string;
	amount: number;
};

type YearlySettlementRow = {
	yearMonth: string;
	monthLabel: string;
	income: number;
	plannedRemaining: number;
	actualSpent: number;
	netAfterActual: number;
	realizedPnl: number;
	cumulativeSaving: number;
};

type YearlySettlementSectionProps = {
	selectedYearText: string;
	excludedMonths: Set<number>;
	onToggleExcludedMonth: (month: number) => void;
	onResetExcludedMonths: () => void;
	loadingSettlementData: boolean;
	yearlyTotalIncome: number;
	yearlyTotalExpense: number;
	yearlyTotalSaving: number;
	latestSavingMonthLabel: string;
	savingCompositionTotal: number;
	savingCompositionItems: SavingCompositionItem[];
	savingCompositionChart: ChartData<"doughnut">;
	savingCompositionChartOptions: ChartOptions<"doughnut">;
	yearlySettlementRows: YearlySettlementRow[];
};

export function YearlySettlementSection({
	selectedYearText,
	excludedMonths,
	onToggleExcludedMonth,
	onResetExcludedMonths,
	loadingSettlementData,
	yearlyTotalIncome,
	yearlyTotalExpense,
	yearlyTotalSaving,
	latestSavingMonthLabel,
	savingCompositionTotal,
	savingCompositionItems,
	savingCompositionChart,
	savingCompositionChartOptions,
	yearlySettlementRows,
}: YearlySettlementSectionProps) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
			<h2 className="text-xl font-semibold">연말 결산</h2>
			<p className="mt-2 text-sm text-slate-600">
				1) 월 잔액 - 실제 사용 금액, 2) 월말 기준 최종 저축액(주식 + 적금)을
				확인합니다.
			</p>
			<div className="mt-4 flex flex-wrap gap-2">
				{Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
					const excluded = excludedMonths.has(month);
					return (
						<button
							key={month}
							type="button"
							onClick={() => onToggleExcludedMonth(month)}
							className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
								excluded
									? "border-slate-200 bg-slate-100 text-slate-400 line-through"
									: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
							}`}
						>
							{month}월
						</button>
					);
				})}
				{excludedMonths.size > 0 && (
					<button
						type="button"
						onClick={onResetExcludedMonths}
						className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-500 hover:bg-rose-100"
					>
						초기화
					</button>
				)}
			</div>
			{loadingSettlementData ? (
				<p className="mt-4 text-sm text-slate-500">
					결산 데이터를 불러오는 중...
				</p>
			) : (
				<>
					<div className="mt-4 grid gap-3 md:grid-cols-3">
						<DashboardStatCard
							title={`${selectedYearText}년 총 수입`}
							value={formatKrw(yearlyTotalIncome)}
							emphasis={yearlyTotalIncome >= 0 ? "positive" : "negative"}
						/>
						<DashboardStatCard
							title={`${selectedYearText}년 총 지출`}
							value={formatKrw(yearlyTotalExpense)}
							emphasis={yearlyTotalExpense >= 0 ? "negative" : "positive"}
						/>
						<DashboardStatCard
							title={`${selectedYearText}년 총 저축`}
							value={formatKrw(yearlyTotalSaving)}
							emphasis={yearlyTotalSaving >= 0 ? "positive" : "negative"}
						/>
					</div>
					<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
						<div className="flex items-end justify-between gap-2">
							<h3 className="text-sm font-semibold text-slate-900">
								총 저축 구성(주식/적금)
							</h3>
							<p className="text-xs text-slate-500">
								기준: {latestSavingMonthLabel} · 합계{" "}
								{formatKrw(savingCompositionTotal)}
							</p>
						</div>
						{savingCompositionItems.length === 0 ? (
							<p className="mt-3 text-sm text-slate-500">
								차트를 표시할 저축 데이터가 없습니다.
							</p>
						) : (
							<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
								<div className="h-[280px]">
									<Doughnut
										data={savingCompositionChart}
										options={savingCompositionChartOptions}
									/>
								</div>
								<div className="grid gap-2 self-start">
									{savingCompositionItems.map((item) => (
										<div
											key={item.label}
											className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
										>
											<p className="truncate text-slate-700">{item.label}</p>
											<div className="shrink-0 text-right">
												<p className="font-semibold text-slate-900">
													{formatKrw(item.amount)}
												</p>
												<p className="text-xs text-slate-500">
													{savingCompositionTotal > 0
														? `${((item.amount / savingCompositionTotal) * 100).toFixed(1)}%`
														: "0.0%"}
												</p>
											</div>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
					<div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
						<table className="min-w-full text-sm">
							<thead className="bg-slate-50 text-slate-600">
								<tr>
									<th className="px-3 py-2 text-left">월</th>
									<th className="px-3 py-2 text-right">추가 수입</th>
									<th className="px-3 py-2 text-right">월 잔액</th>
									<th className="px-3 py-2 text-right">실제 사용</th>
									<th className="px-3 py-2 text-right">순잔액</th>
									<th className="px-3 py-2 text-right">실현손익</th>
									<th className="px-3 py-2 text-right">월말 최종 저축액</th>
								</tr>
							</thead>
							<tbody>
								{yearlySettlementRows.map((row) => {
									const monthNum = Number.parseInt(row.yearMonth.slice(5), 10);
									const isExcluded = excludedMonths.has(monthNum);
									return (
										<tr
											key={row.yearMonth}
											className={`border-t border-slate-100 ${isExcluded ? "opacity-30" : ""}`}
										>
											<td className="px-3 py-2">{row.monthLabel}</td>
											<td className="px-3 py-2 text-right">
												{formatKrw(row.income)}
											</td>
											<td className="px-3 py-2 text-right">
												{formatKrw(row.plannedRemaining)}
											</td>
											<td className="px-3 py-2 text-right">
												{formatKrw(row.actualSpent)}
											</td>
											<td className="px-3 py-2 text-right">
												<span
													className={
														row.netAfterActual >= 0
															? "text-emerald-600"
															: "text-rose-600"
													}
												>
													{formatKrw(row.netAfterActual)}
												</span>
											</td>
											<td className="px-3 py-2 text-right">
												<span
													className={
														row.realizedPnl >= 0
															? "text-emerald-600"
															: "text-rose-600"
													}
												>
													{row.realizedPnl >= 0 ? "+" : "-"}
													{formatKrw(Math.abs(row.realizedPnl))}
												</span>
											</td>
											<td className="px-3 py-2 text-right">
												{formatKrw(row.cumulativeSaving)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</>
			)}
		</section>
	);
}

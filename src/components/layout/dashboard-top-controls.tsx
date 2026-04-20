import { Button } from "@/components/ui/button";

type AppTab = "DASHBOARD" | "YEARLY_SETTLEMENT";

type DashboardTopControlsProps = {
	activeTab: AppTab;
	onSelectDashboardTab: () => void;
	onSelectYearlyTab: () => void;
	selectedYearText: string;
	selectableYears: number[];
	onChangeYear: (yearText: string) => void;
	selectedMonthText: string;
	onChangeMonth: (monthText: string) => void;
	isSelectedMonthEmpty: boolean;
	onCopyPreviousMonth: () => void;
	copyingPreviousMonth: boolean;
	onExportExcel: () => void;
};

export function DashboardTopControls({
	activeTab,
	onSelectDashboardTab,
	onSelectYearlyTab,
	selectedYearText,
	selectableYears,
	onChangeYear,
	selectedMonthText,
	onChangeMonth,
	isSelectedMonthEmpty,
	onCopyPreviousMonth,
	copyingPreviousMonth,
	onExportExcel,
}: DashboardTopControlsProps) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant={activeTab === "DASHBOARD" ? "default" : "outline"}
						onClick={onSelectDashboardTab}
					>
						월별 입력
					</Button>
					<Button
						type="button"
						variant={activeTab === "YEARLY_SETTLEMENT" ? "default" : "outline"}
						onClick={onSelectYearlyTab}
					>
						연말 결산
					</Button>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<select
						className="rounded-md border border-slate-300 px-2 py-2 text-sm"
						value={selectedYearText}
						onChange={(event) => onChangeYear(event.target.value)}
					>
						{selectableYears.map((year) => (
							<option key={year} value={String(year)}>
								{year}년
							</option>
						))}
					</select>
					{activeTab === "DASHBOARD" ? (
						<>
							<select
								className="rounded-md border border-slate-300 px-2 py-2 text-sm"
								value={selectedMonthText}
								onChange={(event) => onChangeMonth(event.target.value)}
							>
								{Array.from({ length: 12 }, (_, index) => index + 1).map(
									(month) => (
										<option key={month} value={String(month).padStart(2, "0")}>
											{month}월
										</option>
									),
								)}
							</select>
							{isSelectedMonthEmpty ? (
								<Button
									type="button"
									variant="outline"
									onClick={onCopyPreviousMonth}
									disabled={copyingPreviousMonth}
								>
									{copyingPreviousMonth
										? "불러오는 중..."
										: "직전 기록 불러오기"}
								</Button>
							) : null}
						</>
					) : null}
					<Button type="button" variant="outline" onClick={onExportExcel}>
						엑셀 내보내기
					</Button>
				</div>
			</div>
		</section>
	);
}

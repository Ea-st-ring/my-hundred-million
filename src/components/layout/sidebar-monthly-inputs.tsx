import { CurrencyInput } from "@/components/common/currency-input";
import { SignedCurrencyInput } from "@/components/common/signed-currency-input";
import { Button } from "@/components/ui/button";
import { formatKrw } from "@/lib/format";

type SidebarMonthlyInputsProps = {
	actualSpent: number;
	onChangeActualSpent: (value: number) => void;
	consumptionExpenseTotal: number;
	actualSpentTotal: number;
	realizedPnl: number;
	onChangeRealizedPnl: (value: number) => void;
	memo: string;
	onChangeMemo: (value: string) => void;
	onSaveOverview: () => void;
	savingOverviewState: boolean;
};

export function SidebarMonthlyInputs({
	actualSpent,
	onChangeActualSpent,
	consumptionExpenseTotal,
	actualSpentTotal,
	realizedPnl,
	onChangeRealizedPnl,
	memo,
	onChangeMemo,
	onSaveOverview,
	savingOverviewState,
}: SidebarMonthlyInputsProps) {
	return (
		<>
			<div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
				<p className="text-xs text-slate-500">실제 사용 금액 (직접 입력)</p>
				<div className="mt-2 flex items-center gap-2">
					<CurrencyInput value={actualSpent} onChange={onChangeActualSpent} />
					<Button
						type="button"
						onClick={onSaveOverview}
						disabled={savingOverviewState}
						className="shrink-0"
					>
						{savingOverviewState ? "저장 중..." : "저장"}
					</Button>
				</div>
				<p className="mt-1 text-xs text-slate-500">
					직접 입력: {formatKrw(actualSpent)}
				</p>
				<p className="mt-1 text-xs text-slate-500">
					소비 섹션 자동 합산: {formatKrw(consumptionExpenseTotal)}
				</p>
				<p className="mt-1 text-sm font-semibold text-slate-700">
					최종 실제 사용 금액: {formatKrw(actualSpentTotal)}
				</p>
			</div>
			<div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
				<p className="text-xs text-slate-500">월별 실현손익 (음수 가능)</p>
				<div className="mt-2 flex items-center gap-2">
					<SignedCurrencyInput
						value={realizedPnl}
						onChange={onChangeRealizedPnl}
					/>
					<Button
						type="button"
						onClick={onSaveOverview}
						disabled={savingOverviewState}
						className="shrink-0"
					>
						{savingOverviewState ? "저장 중..." : "저장"}
					</Button>
				</div>
				<p
					className={`mt-1 text-xs ${
						realizedPnl >= 0 ? "text-emerald-600" : "text-rose-600"
					}`}
				>
					{realizedPnl >= 0 ? "+" : "-"}
					{formatKrw(Math.abs(realizedPnl))}
				</p>
			</div>
			<div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
				<p className="text-xs text-slate-500">월 메모</p>
				<textarea
					className="mt-2 min-h-[120px] w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-100 transition focus:border-blue-400 focus:ring-2"
					value={memo}
					onChange={(event) => onChangeMemo(event.target.value)}
					placeholder="이번 달 메모를 기록해두세요. (예: 큰 지출 사유, 투자 계획, 체크할 일)"
				/>
				<div className="mt-2 flex items-center justify-between gap-2">
					<p className="text-xs text-slate-500">
						{memo.length.toLocaleString()}자
					</p>
					<Button
						type="button"
						onClick={onSaveOverview}
						disabled={savingOverviewState}
						className="shrink-0"
					>
						{savingOverviewState ? "저장 중..." : "메모 저장"}
					</Button>
				</div>
			</div>
		</>
	);
}

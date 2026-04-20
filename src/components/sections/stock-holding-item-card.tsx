import { InlineNumberInput } from "@/components/common/inline-number-input";
import { Button } from "@/components/ui/button";
import { getWeekdayLabel } from "@/lib/app-helpers";
import { formatKrw, formatUsd } from "@/lib/format";
import {
	type AccumulationCurrency,
	type AccumulationType,
	CADENCES,
	type Cadence,
	type StockHolding,
	type StockQuote,
} from "@/types/finance";

type HoldingEditDraft = {
	quantity: number;
	averagePrice: number;
	isAccumulating: boolean;
	cadence: Cadence;
	runDay: number;
	accumulationType: AccumulationType;
	accumulationCurrency: AccumulationCurrency;
	accumulationValue: number;
};

type StockHoldingItemCardProps = {
	item: StockHolding;
	draft: HoldingEditDraft;
	quote: StockQuote | null | undefined;
	usdKrwRate: number | null;
	onChangeDraft: (nextDraft: HoldingEditDraft) => void;
	onUpdate: () => void;
	onDelete: () => void;
};

export function StockHoldingItemCard({
	item,
	draft,
	quote,
	usdKrwRate,
	onChangeDraft,
	onUpdate,
	onDelete,
}: StockHoldingItemCardProps) {
	const currentPrice = typeof quote?.price === "number" ? quote.price : null;
	const isUsHolding = item.market === "US";
	const evaluationAmountLocal =
		currentPrice === null ? null : currentPrice * draft.quantity;
	const costAmountLocal = draft.averagePrice * draft.quantity;
	const profitAmountLocal =
		evaluationAmountLocal === null
			? null
			: evaluationAmountLocal - costAmountLocal;
	const profitRate =
		profitAmountLocal === null || costAmountLocal <= 0
			? null
			: (profitAmountLocal / costAmountLocal) * 100;
	const currentPriceKrw =
		isUsHolding && currentPrice !== null && usdKrwRate !== null
			? currentPrice * usdKrwRate
			: currentPrice;
	const evaluationAmountKrw =
		isUsHolding && evaluationAmountLocal !== null && usdKrwRate !== null
			? evaluationAmountLocal * usdKrwRate
			: evaluationAmountLocal;
	const profitAmountKrw =
		isUsHolding && profitAmountLocal !== null && usdKrwRate !== null
			? profitAmountLocal * usdKrwRate
			: profitAmountLocal;
	const scheduleText =
		item.isAccumulating && item.cadence !== null && item.runDay !== null
			? item.cadence === "WEEKLY"
				? `매주 ${getWeekdayLabel(item.runDay)}`
				: `매달 ${item.runDay}일`
			: "잔고 전용";

	return (
		<div className="rounded-lg border border-slate-200 p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="font-medium">
						{item.name} ({item.symbol})
					</p>
					<p className="text-xs text-slate-500">
						유형:{" "}
						{item.isAccumulating ? `모으기 (${scheduleText})` : scheduleText}
					</p>
					{isUsHolding ? (
						<p className="text-xs text-slate-500">
							현재가:{" "}
							{currentPrice === null ? "미연동" : formatUsd(currentPrice)} /{" "}
							{currentPriceKrw === null
								? "환율 미연동"
								: formatKrw(currentPriceKrw)}
							<br />
							평가금액:{" "}
							{evaluationAmountLocal === null
								? "-"
								: formatUsd(evaluationAmountLocal)}{" "}
							/{" "}
							{evaluationAmountKrw === null
								? "환율 미연동"
								: formatKrw(evaluationAmountKrw)}
						</p>
					) : (
						<p className="text-xs text-slate-500">
							현재가:{" "}
							{currentPrice === null ? "미연동" : formatKrw(currentPrice)} /
							평가금액:{" "}
							{evaluationAmountLocal === null
								? "-"
								: formatKrw(evaluationAmountLocal)}
						</p>
					)}
					<p
						className={`text-xs ${
							profitAmountLocal !== null && profitAmountLocal >= 0
								? "text-emerald-600"
								: "text-rose-600"
						}`}
					>
						수익:{" "}
						{profitAmountLocal === null
							? "-"
							: isUsHolding
								? formatUsd(profitAmountLocal)
								: formatKrw(profitAmountLocal)}
						{profitRate === null ? "" : ` (${profitRate.toFixed(2)}%)`}
						{isUsHolding
							? ` / ${
									profitAmountKrw === null
										? "환율 미연동"
										: formatKrw(profitAmountKrw)
								}`
							: ""}
					</p>
				</div>
				<div className="flex gap-2">
					<Button type="button" onClick={onUpdate}>
						수정 저장
					</Button>
					<Button type="button" variant="outline" onClick={onDelete}>
						삭제
					</Button>
				</div>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-6">
				<InlineNumberInput
					label="수량"
					value={draft.quantity}
					step={0.0001}
					onChange={(value) =>
						onChangeDraft({
							...draft,
							quantity: value,
						})
					}
				/>
				<InlineNumberInput
					label={item.market === "US" ? "평단가(USD)" : "평단가(원)"}
					value={draft.averagePrice}
					step={0.01}
					onChange={(value) =>
						onChangeDraft({
							...draft,
							averagePrice: value,
						})
					}
				/>
				<div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-2">
					<label className="flex items-center gap-2 text-xs font-medium">
						<input
							type="checkbox"
							checked={draft.isAccumulating}
							onChange={(event) =>
								onChangeDraft({
									...draft,
									isAccumulating: event.target.checked,
								})
							}
						/>
						모으기 종목
					</label>
				</div>
				{draft.isAccumulating ? (
					<>
						<div>
							<label className="mb-1 block text-xs font-medium">주기</label>
							<select
								value={draft.cadence}
								onChange={(event) =>
									onChangeDraft({
										...draft,
										cadence: event.target.value as Cadence,
										runDay: 1,
									})
								}
								className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
							>
								{CADENCES.map((cadence) => (
									<option key={cadence} value={cadence}>
										{cadence === "WEEKLY" ? "매주" : "매달"}
									</option>
								))}
							</select>
						</div>
						<InlineNumberInput
							label={
								draft.cadence === "WEEKLY" ? "실행 요일(1-7)" : "실행일(1-31)"
							}
							value={draft.runDay}
							step={1}
							onChange={(value) =>
								onChangeDraft({
									...draft,
									runDay: Number.parseInt(String(value), 10),
								})
							}
						/>
						<div>
							<label className="mb-1 block text-xs font-medium">
								모으기 기준
							</label>
							<select
								value={draft.accumulationType}
								onChange={(event) =>
									onChangeDraft({
										...draft,
										accumulationType: event.target.value as AccumulationType,
									})
								}
								className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
							>
								<option value="AMOUNT">회차 금액</option>
								<option value="SHARES">회차 수량</option>
							</select>
						</div>
						{draft.accumulationType === "AMOUNT" && item.market === "US" ? (
							<div>
								<label className="mb-1 block text-xs font-medium">통화</label>
								<select
									value={draft.accumulationCurrency}
									onChange={(event) =>
										onChangeDraft({
											...draft,
											accumulationCurrency: event.target
												.value as AccumulationCurrency,
										})
									}
									className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
								>
									<option value="USD">USD</option>
									<option value="KRW">원화</option>
								</select>
							</div>
						) : null}
						<InlineNumberInput
							label={
								draft.accumulationType === "AMOUNT"
									? draft.accumulationCurrency
									: "주"
							}
							value={draft.accumulationValue}
							step={0.0001}
							onChange={(value) =>
								onChangeDraft({
									...draft,
									accumulationValue: value,
								})
							}
						/>
					</>
				) : null}
			</div>
		</div>
	);
}

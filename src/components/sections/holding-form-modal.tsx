import type { Dispatch, SetStateAction } from "react";

import { LayerModal } from "@/components/common/layer-modal";
import { Button } from "@/components/ui/button";
import {
	type AccumulationCurrency,
	type AccumulationType,
	BROKER_LABELS,
	BROKERS,
	CADENCES,
	type Cadence,
	type StockHolding,
	type SymbolSearchItem,
} from "@/types/finance";

type HoldingForm = Omit<
	StockHolding,
	"id" | "accumulationStartedAt" | "cadence" | "runDay"
> & {
	cadence: Cadence;
	runDay: number;
};

type HoldingFormModalProps = {
	open: boolean;
	holdingForm: HoldingForm;
	stockSearchQuery: string;
	stockSymbolResults: SymbolSearchItem[];
	searchingStockSymbol: boolean;
	submittingHolding: boolean;
	setHoldingForm: Dispatch<SetStateAction<HoldingForm>>;
	setStockSearchQuery: Dispatch<SetStateAction<string>>;
	onSearchSymbols: () => void | Promise<void>;
	onApplySymbol: (item: SymbolSearchItem) => void;
	onAddHolding: () => void | Promise<void>;
	onClose: () => void;
	onChangeMarket: (market: "KR" | "US") => void;
};

export function HoldingFormModal({
	open,
	holdingForm,
	stockSearchQuery,
	stockSymbolResults,
	searchingStockSymbol,
	submittingHolding,
	setHoldingForm,
	setStockSearchQuery,
	onSearchSymbols,
	onApplySymbol,
	onAddHolding,
	onClose,
	onChangeMarket,
}: HoldingFormModalProps) {
	return (
		<LayerModal open={open} title="보유 종목 추가" onClose={onClose}>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label className="mb-1 block text-xs font-medium">증권사</label>
					<select
						value={holdingForm.broker}
						onChange={(event) =>
							setHoldingForm((prev) => ({
								...prev,
								broker: event.target.value as (typeof BROKERS)[number],
							}))
						}
						className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
					>
						{BROKERS.map((broker) => (
							<option value={broker} key={broker}>
								{BROKER_LABELS[broker]}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className="mb-1 block text-xs font-medium">시장</label>
					<select
						value={holdingForm.market}
						onChange={(event) =>
							onChangeMarket(event.target.value as "KR" | "US")
						}
						className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
					>
						<option value="KR">한국</option>
						<option value="US">미국</option>
					</select>
				</div>
				<div className="col-span-2">
					<label className="mb-1 block text-xs font-medium">종목 검색</label>
					<div className="flex gap-2">
						<input
							className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
							value={stockSearchQuery}
							onChange={(event) => setStockSearchQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									void onSearchSymbols();
								}
							}}
							placeholder={
								holdingForm.market === "KR"
									? "삼성전자, 005930"
									: "AAPL, TSLA, NVDA"
							}
						/>
						<Button
							type="button"
							variant="outline"
							onClick={() => void onSearchSymbols()}
							disabled={searchingStockSymbol}
						>
							{searchingStockSymbol ? "검색 중" : "검색"}
						</Button>
					</div>
					<div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-2">
						{stockSymbolResults.length === 0 ? (
							<p className="text-xs text-slate-500">
								종목명 또는 티커를 검색하고 결과를 선택하세요.
							</p>
						) : (
							stockSymbolResults.map((item) => (
								<button
									type="button"
									key={`${item.quoteSymbol}-${item.name}`}
									onClick={() => onApplySymbol(item)}
									className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
								>
									<p className="font-medium">{item.name}</p>
									<p className="text-xs text-slate-500">
										{item.symbol} ({item.market}) / {item.exchange}
									</p>
								</button>
							))
						)}
					</div>
					<p className="mt-2 text-xs text-slate-500">
						선택된 종목:{" "}
						{holdingForm.symbol.trim().length > 0
							? `${holdingForm.name} (${holdingForm.symbol})`
							: "없음"}
					</p>
				</div>
				<div>
					<label className="mb-1 block text-xs font-medium">보유 수량</label>
					<input
						type="number"
						min="0"
						step="0.0001"
						value={holdingForm.quantity}
						onChange={(event) =>
							setHoldingForm((prev) => ({
								...prev,
								quantity: Number.parseFloat(event.target.value || "0"),
							}))
						}
						className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
					/>
				</div>
				<div>
					<label className="mb-1 block text-xs font-medium">
						평단가 ({holdingForm.market === "US" ? "USD" : "원"})
					</label>
					<input
						type="number"
						min="0"
						step="0.01"
						value={holdingForm.averagePrice}
						onChange={(event) =>
							setHoldingForm((prev) => ({
								...prev,
								averagePrice: Number.parseFloat(event.target.value || "0"),
							}))
						}
						className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
					/>
				</div>
				<div className="col-span-2 rounded-md border border-slate-200 bg-slate-50 p-2">
					<label className="flex items-center gap-2 text-xs font-medium">
						<input
							type="checkbox"
							checked={holdingForm.isAccumulating}
							onChange={(event) =>
								setHoldingForm((prev) => ({
									...prev,
									isAccumulating: event.target.checked,
								}))
							}
						/>
						모으기 종목으로 관리
					</label>
				</div>
				{holdingForm.isAccumulating ? (
					<>
						<div>
							<label className="mb-1 block text-xs font-medium">주기</label>
							<select
								value={holdingForm.cadence}
								onChange={(event) =>
									setHoldingForm((prev) => ({
										...prev,
										cadence: event.target.value as Cadence,
										runDay: 1,
									}))
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
						<div>
							<label className="mb-1 block text-xs font-medium">
								실행일 (
								{holdingForm.cadence === "WEEKLY"
									? "1=월 ... 7=일"
									: "매달 n일"}
								)
							</label>
							<input
								type="number"
								min="1"
								max={holdingForm.cadence === "WEEKLY" ? "7" : "31"}
								step="1"
								value={holdingForm.runDay}
								onChange={(event) =>
									setHoldingForm((prev) => ({
										...prev,
										runDay: Number.parseInt(event.target.value || "1", 10),
									}))
								}
								className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
							/>
						</div>
						<div>
							<label className="mb-1 block text-xs font-medium">
								모으기 기준
							</label>
							<select
								value={holdingForm.accumulationType}
								onChange={(event) =>
									setHoldingForm((prev) => ({
										...prev,
										accumulationType: event.target.value as AccumulationType,
									}))
								}
								className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
							>
								<option value="AMOUNT">회차 금액</option>
								<option value="SHARES">회차 수량</option>
							</select>
						</div>
						{holdingForm.accumulationType === "AMOUNT" &&
						holdingForm.market === "US" ? (
							<div>
								<label className="mb-1 block text-xs font-medium">
									금액 통화
								</label>
								<select
									value={holdingForm.accumulationCurrency}
									onChange={(event) =>
										setHoldingForm((prev) => ({
											...prev,
											accumulationCurrency: event.target
												.value as AccumulationCurrency,
										}))
									}
									className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
								>
									<option value="USD">USD</option>
									<option value="KRW">원화(KRW)</option>
								</select>
							</div>
						) : null}
						<div>
							<label className="mb-1 block text-xs font-medium">
								모으기 값 (
								{holdingForm.accumulationType === "AMOUNT"
									? holdingForm.market === "US"
										? holdingForm.accumulationCurrency
										: "원"
									: "주"}
								)
							</label>
							<input
								type="number"
								min="0"
								step="0.0001"
								value={holdingForm.accumulationValue}
								onChange={(event) =>
									setHoldingForm((prev) => ({
										...prev,
										accumulationValue: Number.parseFloat(
											event.target.value || "0",
										),
									}))
								}
								className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
							/>
						</div>
					</>
				) : null}
			</div>
			<div className="mt-4 flex justify-end gap-2">
				<Button type="button" variant="outline" onClick={onClose}>
					닫기
				</Button>
				<Button
					type="button"
					onClick={() => void onAddHolding()}
					disabled={submittingHolding}
				>
					{submittingHolding ? "저장 중..." : "보유 종목 저장"}
				</Button>
			</div>
		</LayerModal>
	);
}

import { useCallback, useEffect, useState } from "react";

import { LayerModal } from "@/components/common/layer-modal";
import { Button } from "@/components/ui/button";
import { formatKrw, formatNumber, formatUsd } from "@/lib/format";
import { insertHolding, updateHolding } from "@/lib/repository";
import { fetchTossHoldings, fetchTossStockInfo } from "@/lib/toss-invest/api";
import { TossInvestError } from "@/lib/toss-invest/client";
import {
	buildHoldingSuggestions,
	type TossHoldingSuggestion,
} from "@/lib/toss-invest/mappers";
import type { TossStockInfo } from "@/lib/toss-invest/types";
import type { StockHolding } from "@/types/finance";

type TossHoldingsPreviewModalProps = {
	open: boolean;
	existingHoldings: StockHolding[];
	onClose: () => void;
	onApplied: (nextHoldings: StockHolding[]) => void;
	onMessage: (message: string) => void;
};

function formatQuantity(value: number): string {
	return formatNumber(value);
}

function formatLocalPrice(value: number, currency: "KRW" | "USD"): string {
	return currency === "USD" ? formatUsd(value) : formatKrw(value);
}

export function TossHoldingsPreviewModal({
	open,
	existingHoldings,
	onClose,
	onApplied,
	onMessage,
}: TossHoldingsPreviewModalProps) {
	const [loading, setLoading] = useState(false);
	const [applying, setApplying] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [suggestions, setSuggestions] = useState<TossHoldingSuggestion[]>([]);
	const [selected, setSelected] = useState<Set<number>>(new Set());

	const loadSuggestions = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const overview = await fetchTossHoldings();
			const newSymbols = overview.items
				.filter(
					(item) =>
						!existingHoldings.some(
							(holding) =>
								holding.broker === "TOSS" &&
								holding.symbol === item.symbol &&
								holding.market === item.marketCountry,
						),
				)
				.map((item) => item.symbol);

			let stockInfoBySymbol = new Map<string, TossStockInfo>();
			if (newSymbols.length > 0) {
				const stockInfoList = await fetchTossStockInfo(newSymbols);
				stockInfoBySymbol = new Map(
					stockInfoList.map((info) => [info.symbol, info]),
				);
			}

			const built = buildHoldingSuggestions(
				overview.items,
				existingHoldings,
				stockInfoBySymbol,
			);
			setSuggestions(built);
			setSelected(
				new Set(
					built
						.map((item, index) => ({ item, index }))
						.filter(({ item }) => item.kind !== "UNCHANGED")
						.map(({ index }) => index),
				),
			);
		} catch (thrown) {
			setError(
				thrown instanceof TossInvestError
					? thrown.message
					: "토스증권 보유종목 조회에 실패했습니다.",
			);
		} finally {
			setLoading(false);
		}
	}, [existingHoldings]);

	useEffect(() => {
		if (open) {
			void loadSuggestions();
		}
	}, [open, loadSuggestions]);

	function toggleSelected(index: number) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	}

	async function handleApply() {
		setApplying(true);
		setError(null);
		try {
			let nextHoldings = existingHoldings;
			let appliedCount = 0;

			for (const [index, suggestion] of suggestions.entries()) {
				if (!selected.has(index) || suggestion.kind === "UNCHANGED") {
					continue;
				}
				if (suggestion.kind === "NEW") {
					const created = await insertHolding(suggestion.input);
					nextHoldings = [...nextHoldings, created];
				} else {
					await updateHolding(suggestion.existing.id, suggestion.input);
					nextHoldings = nextHoldings.map((holding) =>
						holding.id === suggestion.existing.id
							? { ...suggestion.input, id: holding.id }
							: holding,
					);
				}
				appliedCount += 1;
			}

			onApplied(nextHoldings);
			onMessage(`토스증권 보유종목 동기화 완료 (${appliedCount}건 반영)`);
			onClose();
			setSuggestions([]);
			setSelected(new Set());
		} catch (thrown) {
			setError(
				thrown instanceof Error
					? thrown.message
					: "보유종목 반영 중 오류가 발생했습니다.",
			);
		} finally {
			setApplying(false);
		}
	}

	return (
		<LayerModal
			open={open}
			title="토스증권 보유종목 동기화"
			onClose={() => {
				setSuggestions([]);
				setSelected(new Set());
				setError(null);
				onClose();
			}}
		>
			<p className="text-sm text-slate-600">
				토스증권 계좌의 실제 보유종목을 가져와 기존 데이터와 비교합니다. 선택한
				항목만 반영되며, 자동으로 덮어쓰지 않습니다.
			</p>

			{loading ? (
				<p className="mt-4 text-sm text-slate-500">불러오는 중...</p>
			) : null}
			{error !== null ? (
				<p className="mt-4 text-sm text-rose-600">{error}</p>
			) : null}

			{!loading && suggestions.length === 0 && error === null ? (
				<p className="mt-4 text-sm text-slate-500">
					토스증권 계좌에 보유종목이 없습니다.
				</p>
			) : null}

			{suggestions.length > 0 ? (
				<div className="mt-4 space-y-2">
					{suggestions.map((suggestion, index) => (
						<div
							key={`${suggestion.tossItem.symbol}-${suggestion.tossItem.marketCountry}`}
							className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm"
						>
							<input
								type="checkbox"
								checked={selected.has(index)}
								disabled={suggestion.kind === "UNCHANGED"}
								onChange={() => toggleSelected(index)}
							/>
							<div className="flex-1">
								<p className="font-medium">
									{suggestion.tossItem.name} ({suggestion.tossItem.symbol})
									<span
										className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
											suggestion.kind === "NEW"
												? "bg-emerald-100 text-emerald-700"
												: suggestion.kind === "UPDATE"
													? "bg-amber-100 text-amber-700"
													: "bg-slate-100 text-slate-500"
										}`}
									>
										{suggestion.kind === "NEW"
											? "신규"
											: suggestion.kind === "UPDATE"
												? "변경"
												: "변동없음"}
									</span>
								</p>
								<p className="mt-1 text-xs text-slate-500">
									수량:{" "}
									{suggestion.kind === "UPDATE"
										? `${formatQuantity(suggestion.existing.quantity)} → `
										: ""}
									{formatQuantity(Number(suggestion.tossItem.quantity))} /
									평단가:{" "}
									{suggestion.kind === "UPDATE"
										? `${formatLocalPrice(suggestion.existing.averagePrice, suggestion.tossItem.currency)} → `
										: ""}
									{formatLocalPrice(
										Number(suggestion.tossItem.averagePurchasePrice),
										suggestion.tossItem.currency,
									)}
								</p>
							</div>
						</div>
					))}
				</div>
			) : null}

			<div className="mt-5 flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={() => void loadSuggestions()}
					disabled={loading || applying}
				>
					새로고침
				</Button>
				<Button
					type="button"
					onClick={() => void handleApply()}
					disabled={loading || applying || selected.size === 0}
				>
					{applying ? "반영 중..." : `선택 항목 반영 (${selected.size})`}
				</Button>
			</div>
		</LayerModal>
	);
}

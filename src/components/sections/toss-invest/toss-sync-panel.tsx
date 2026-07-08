import { useCallback, useEffect, useState } from "react";

import { TossCredentialsSettingsModal } from "@/components/sections/toss-invest/toss-credentials-settings";
import { TossDepositPreviewModal } from "@/components/sections/toss-invest/toss-deposit-preview-modal";
import { TossHoldingsPreviewModal } from "@/components/sections/toss-invest/toss-holdings-preview-modal";
import { Button } from "@/components/ui/button";
import {
	fetchTossCredentialStatus,
	type TossCredentialStatus,
} from "@/lib/toss-invest/credentials";
import type { FinanceOverview, StockHolding } from "@/types/finance";

type TossSyncPanelProps = {
	holdings: StockHolding[];
	overview: FinanceOverview;
	onHoldingsChanged: (nextHoldings: StockHolding[]) => void;
	onOverviewChanged: (nextOverview: FinanceOverview) => void;
	onMessage: (message: string) => void;
};

export function TossSyncPanel({
	holdings,
	overview,
	onHoldingsChanged,
	onOverviewChanged,
	onMessage,
}: TossSyncPanelProps) {
	const [isHoldingsModalOpen, setIsHoldingsModalOpen] = useState(false);
	const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
	const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
	const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
	const [credentialStatus, setCredentialStatus] =
		useState<TossCredentialStatus | null>(null);
	const [statusLoaded, setStatusLoaded] = useState(false);

	const loadStatus = useCallback(async () => {
		try {
			const status = await fetchTossCredentialStatus();
			setCredentialStatus(status);
		} catch {
			setCredentialStatus(null);
		} finally {
			setStatusLoaded(true);
		}
	}, []);

	useEffect(() => {
		void loadStatus();
	}, [loadStatus]);

	const isRegistered = credentialStatus !== null;

	return (
		<div className="rounded-xl border border-slate-200 bg-white p-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="text-sm font-semibold">토스증권 Open API 연동</p>
					<p className="text-xs text-slate-500">
						실제 토스증권 계좌의 보유종목·매수가능금액을 가져와 확인 후
						반영합니다.
						{lastSyncedAt === null
							? ""
							: ` (마지막 동기화: ${new Date(lastSyncedAt).toLocaleString("ko-KR")})`}
					</p>
					{statusLoaded && !isRegistered ? (
						<p className="mt-1 text-xs text-amber-700">
							아직 연동 정보가 등록되지 않았습니다. 먼저 설정에서 client_id /
							client_secret / accountSeq를 등록해주세요.
						</p>
					) : null}
				</div>
				<div className="flex gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => setIsSettingsModalOpen(true)}
					>
						설정
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => setIsHoldingsModalOpen(true)}
						disabled={!isRegistered}
					>
						보유종목 동기화
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => setIsDepositModalOpen(true)}
						disabled={!isRegistered}
					>
						예치금 동기화
					</Button>
				</div>
			</div>

			<TossCredentialsSettingsModal
				open={isSettingsModalOpen}
				status={credentialStatus}
				onClose={() => setIsSettingsModalOpen(false)}
				onSaved={(nextStatus) => {
					setCredentialStatus(nextStatus);
					onMessage("토스증권 연동 정보가 저장되었습니다.");
				}}
				onDeleted={() => {
					setCredentialStatus(null);
					onMessage("토스증권 연동을 해제했습니다.");
				}}
			/>
			<TossHoldingsPreviewModal
				open={isHoldingsModalOpen}
				existingHoldings={holdings}
				onClose={() => setIsHoldingsModalOpen(false)}
				onApplied={(nextHoldings) => {
					onHoldingsChanged(nextHoldings);
					setLastSyncedAt(new Date().toISOString());
				}}
				onMessage={onMessage}
			/>
			<TossDepositPreviewModal
				open={isDepositModalOpen}
				overview={overview}
				onClose={() => setIsDepositModalOpen(false)}
				onApplied={(nextOverview) => {
					onOverviewChanged(nextOverview);
					setLastSyncedAt(new Date().toISOString());
				}}
				onMessage={onMessage}
			/>
		</div>
	);
}

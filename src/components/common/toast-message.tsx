import { useEffect } from "react";

type ToastMessageProps = {
	message: string;
	onClose: () => void;
};

export function ToastMessage({ message, onClose }: ToastMessageProps) {
	useEffect(() => {
		if (message.length === 0) {
			return;
		}
		const timeoutId = window.setTimeout(() => {
			onClose();
		}, 3000);
		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [message, onClose]);

	if (message.length === 0) {
		return null;
	}

	return (
		<div className="fixed left-1/2 top-4 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-blue-200 bg-white p-4 shadow-lg">
			<div className="flex items-start justify-between gap-3">
				<p className="text-sm text-slate-700">{message}</p>
				<button
					type="button"
					onClick={onClose}
					className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
				>
					X
				</button>
			</div>
		</div>
	);
}

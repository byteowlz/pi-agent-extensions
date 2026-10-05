/** Public v1 protocol types only. Claims are routing metadata, never authorization. */
export type PresentationClientKind = "oqto-web" | "oqto-desktop" | "pi-tui-rpc" | "other-rpc";
export type PresentationCapability = "selection.questions.v1" | "selection.review.v1";
export interface PresentationRequest {
	readonly version: 1;
	readonly requestId?: string;
}
export interface PresentationBindRequest extends PresentationRequest {
	readonly id: string;
	readonly clientKind: PresentationClientKind;
	readonly capabilities: readonly PresentationCapability[];
	/** Milliseconds; defaults to 60000, range 5000..600000. */
	readonly leaseMs?: number;
}
export interface PresentationUnbindRequest extends PresentationRequest {
	readonly id: string;
}
export type PresentationListRequest = PresentationRequest;
export interface PresentationBinding {
	readonly id: string;
	readonly clientKind: PresentationClientKind;
	readonly capabilities: readonly PresentationCapability[];
	/** Unix epoch milliseconds. */
	readonly expiresAt: number;
}
export interface PresentationSnapshot {
	readonly version: 1;
	readonly scopeId: string;
	readonly bindings: readonly PresentationBinding[];
}
export interface PresentationQuery {
	readonly version: 1;
	readonly scopeId: string;
	readonly reply: (snapshot: PresentationSnapshot) => void;
}
export type PresentationCommand = "presentation-bind" | "presentation-unbind" | "presentation-list";
export type PresentationReply = {
	readonly version: 1;
	readonly requestId?: string;
	readonly command: PresentationCommand;
} & (
	| { readonly ok: true; readonly snapshot: PresentationSnapshot }
	| {
			readonly ok: false;
			readonly error: "invalid-request";
	  }
);

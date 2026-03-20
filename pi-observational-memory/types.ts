/**
 * Types for the observational memory extension.
 */

/** Model configuration for observer or reflector. */
export interface ModelConfig {
	provider: string;
	model: string;
	temperature: number;
	maxOutputTokens: number;
}

/** Observer-specific configuration. */
export interface ObserverConfig extends ModelConfig {
	/** Token threshold for messages to trigger observation (chars / 4 estimate). */
	messageTokenThreshold: number;
}

/** Reflector-specific configuration. */
export interface ReflectorConfig extends ModelConfig {
	/** Token threshold for observations before reflector consolidation kicks in. */
	observationTokenThreshold: number;
}

/** Full memory configuration as stored in memory.json. */
export interface MemoryConfig {
	observer: ObserverConfig;
	reflector: ReflectorConfig;
}

/** Details stored in the compaction entry for observational memory. */
export interface ObservationalMemoryDetails {
	type: "observational-memory";
	observationTokens: number;
	reflected: boolean;
}

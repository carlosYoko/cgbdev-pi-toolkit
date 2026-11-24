type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return typeof value === "string" && THINKING_LEVELS.includes(value as (typeof THINKING_LEVELS)[number]);
}

export function getThinkingArgs(
	agent: { model?: string; thinkingLevel?: ThinkingLevel },
	defaults: { thinkingLevel?: ThinkingLevel },
): string[] {
	const level = agent.thinkingLevel ?? (!agent.model ? defaults.thinkingLevel : undefined);
	return level ? ["--thinking", level] : [];
}

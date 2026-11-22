import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import nextPlugin from "@next/eslint-plugin-next";

export default [
	js.configs.recommended,
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
			},
			globals: {
				console: "readonly",
				process: "readonly",
				fetch: "readonly",
				Response: "readonly",
				Request: "readonly",
				URL: "readonly",
				URLSearchParams: "readonly",
				setTimeout: "readonly",
				clearTimeout: "readonly",
			},
		},
		plugins: {
			"@typescript-eslint": tsPlugin,
			"@next/next": nextPlugin,
		},
		rules: {
			...tsPlugin.configs.recommended.rules,
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"@typescript-eslint/no-explicit-any": "warn",
			"no-undef": "off",
			"no-redeclare": "off",
			"@typescript-eslint/no-redeclare": "off",
			"no-useless-assignment": "off",
		},
	},
	{
		ignores: [
			".next/**",
			"node_modules/**",
			"dist/**",
			"coverage/**",
			"next-env.d.ts",
		],
	},
];

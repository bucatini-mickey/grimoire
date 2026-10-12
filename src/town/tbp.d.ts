// Town files are bundled as text (build.mjs: loader '.tbp': 'text').
declare module '*.tbp' {
	const text: string;
	export default text;
}

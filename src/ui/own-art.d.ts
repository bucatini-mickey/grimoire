// Your own pictures, read from art/*.png by the build (build.mjs, tools/art.mjs).
declare module 'art:own' {
	const art: { palette: Record<string, string>; images: Record<string, string[]> };
	export default art;
}

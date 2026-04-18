/**
 * Module declaration for hls.js
 * This shim allows TypeScript to import hls.js without errors,
 * using our local HlsConstructor/HlsInstance interfaces in HlsPlayer.tsx.
 */
declare module "hls.js" {
  // Minimal type so dynamic import doesn't error out.
  // Actual runtime types are handled via the HlsConstructor interface in HlsPlayer.tsx.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Hls: any;
  export default Hls;
  export = Hls;
}

import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  target: 'es2020',
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
  splitting: false,
  outDir: 'dist',
  external: [],
  banner: {
    js: '/*! @brid9e/fuzzy-search - 智能模糊搜索库 */'
  }
})

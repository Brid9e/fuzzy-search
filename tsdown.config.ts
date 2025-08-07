import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: false, // 关闭sourcemap以减小体积
  clean: true,
  minify: true, // 启用压缩
  treeshake: true,
  outDir: 'dist',
  external: [],
  platform: 'neutral',
  // 添加更多压缩选项
  silent: true // 减少构建输出
})

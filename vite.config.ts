import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }

          // Strip unreferenced raw archive GLBs & DCC source files from dist/ (never touches public/)
          // so web deployments and the packaged Android APK stay lean (~125 MB instead of ~900 MB).
          if (fs.existsSync(distDir)) {
            const worldDir = path.join(distDir, 'models', 'world');
            if (fs.existsSync(worldDir)) {
              for (const entry of fs.readdirSync(worldDir, {withFileTypes: true})) {
                if (entry.isFile() && entry.name.endsWith('.glb')) {
                  fs.rmSync(path.join(worldDir, entry.name), {force: true});
                }
              }
            }
            const usedReady = new Set([
              'bldg_01_tudor_bakery.glb',
              'bldg_02_timber_barn.glb',
              'bldg_03_red_brick_grand.glb',
              'bldg_04_red_brick_low.glb',
              'bldg_05_terracotta_shop.glb',
              'bldg_06_brown_stucco.glb',
              'bldg_08_white_tile_apt.glb',
              'bldg_09_modern_roastery.glb',
              'bldg_10_urban_arcade.glb',
              'building_supermarket.glb',
              'bush_lupine.glb',
              'bush_shrub_1.glb',
              'bush_shrub_2.glb',
              'flower_rose.glb',
              'flower_sunflower.glb',
              'flower_tulips.glb',
              'prop_apple.glb',
              'prop_banana.glb',
              'prop_basket.glb',
              'prop_bench.glb',
              'prop_car_bmw.glb',
              'prop_poop.glb',
              'prop_treats.glb',
              'prop_watermelon.glb',
              'rock_outcrop.glb',
              'tree_birch.glb',
              'tree_fir_1.glb',
              'tree_fir_2.glb',
              'tree_hero.glb',
              'tree_maple.glb',
              'tree_oak.glb',
            ]);
            const readyDir = path.join(worldDir, 'ready');
            if (fs.existsSync(readyDir)) {
              for (const entry of fs.readdirSync(readyDir, {withFileTypes: true})) {
                if (entry.isFile() && !usedReady.has(entry.name)) {
                  fs.rmSync(path.join(readyDir, entry.name), {force: true});
                }
              }
            }
            const hdriDir = path.join(distDir, 'hdri');
            if (fs.existsSync(hdriDir)) {
              for (const entry of fs.readdirSync(hdriDir, {withFileTypes: true})) {
                if (
                  entry.isFile() &&
                  entry.name !== 'sky_1k.hdr' &&
                  entry.name !== 'DaySkyHDRI006A_2K_TONEMAPPED.jpg'
                ) {
                  fs.rmSync(path.join(hdriDir, entry.name), {force: true});
                }
              }
            }
            const pruneDcc = (dir: string) => {
              if (!fs.existsSync(dir)) return;
              for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) pruneDcc(full);
                else if (/\.(blend|usdc|mtlx|tres|exr)$/i.test(entry.name)) {
                  fs.rmSync(full, {force: true});
                }
              }
            };
            pruneDcc(path.join(distDir, 'textures'));
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {ignored: ['**/public/**']},
    },
  };
});

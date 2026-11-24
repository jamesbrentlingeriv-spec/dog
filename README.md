# 🐾 Barkshire — 3D Open-World Dog Life Simulator

An open-world 3D dog life simulator built with **React 19**, **Three.js**, **Tailwind CSS**, and **Vite**. Explore a town and expansive park, sniff out hidden treats, mark territory hydrants, get pet by townspeople, switch dog breeds with realistic physics, and experience dynamic weather.

---

## 🌍 World Assets & Placements

All 18 assets intended for `/models/world/` are integrated in [`src/game/worldModels.ts`](file:///c:/Users/paloptical/Downloads/dog/src/game/worldModels.ts) with collision volumes, auto-grounding, bounding-box scaling, and shadow casting:

| Asset | Placement Details |
|---|---|
| **`super_market_for_free.glb`** | Commercial Supermarket landmark on west lane (`x: -64, z: 36`) |
| **`dae_diorama_-_grandmas_house.glb`** | Grandma's House diorama in south meadow (`x: 7, z: 54`) |
| **`taiwan_yangmingshan_-_datun_nature_park.glb`** | Nature Park diorama chunk on east ridge (`x: 64, z: 52`) |
| **`valars_plant_pack_2.glb`** | 5 garden bed clusters across town hall, park, and meadow paths |
| **`game_ready_fruit_asset_pack.glb`** | 4 produce crates outside grocer, market, bakery, and picnic spots |
| **`doggy_treats_game_ready_prop.glb`** | 5 treat stations outside pet shop, supermarket, cafe, and dog park |
| **`fake_dog_poop_prank.glb`** | 5 comedic props along sidewalks and park turf |
| **`oak_trees.glb`** | 5 deciduous oak groves across park borders and meadows |
| **`realistic_fir_trees_pack_lods_gameready.glb`** | 4 evergreen fir groves on perimeter hills |
| **`fantasyassets_-_vol3_trees_and_bushes.glb`** | 4 stylized tree and shrub clusters |
| **`tree_animate.glb`** | 5 animated morph trees swaying in the wind |
| **`city_street_3.glb`** | Distant skyline backdrop to the northwest |
| **`neighbourhood_city_modular_lowpoly.glb`** | Distant neighborhood backdrop to the north |
| **`westside_vet_hospital.glb`** | Distant veterinary campus backdrop to the west |
| **`old_city.glb`** | Distant historic city skyline to the east |
| **`flowersrose_and_sunflower.glb`** | 18 scattered flower patches throughout park turf |
| **`realistic_hd_yellow_bush_lupine_1525.glb`** | 14 scattered lupine bushes across lawns |
| **`grass_claster__downoad__like_please.glb`** | 28 scattered grass clumps across meadows |

*Full procedural fallbacks ensure that the world, buildings, roads, parks, trees, agility equipment, treats, and hydrants render even before GLB models finish loading or if any asset is missing.*

---

## 🚀 Preparing for Git & GitHub

The project is initialized as a clean Git repository on branch `main` at the project root.

To push to GitHub:

```bash
# 1. Add your GitHub repository remote
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git

# 2. Push main branch
git branch -M main
git push -u origin main
```

---

## ⚡ Deploying to Vercel

The project includes [`vercel.json`](file:///c:/Users/paloptical/Downloads/dog/vercel.json) configured for Vite single-page applications.

### Option 1: Via Vercel Web Dashboard (Recommended)
1. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
2. Select your imported GitHub repository.
3. Vercel automatically detects the framework as **Vite**:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Click **Deploy**.

### Option 2: Via Vercel CLI
```bash
npm i -g vercel
vercel
```

---

## 💻 Local Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Run type check
npm run lint

# Build production bundle
npm run build
```

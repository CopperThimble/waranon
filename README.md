# Project Summary

## App
WARNO mod webapp for building/exporting mod files.

## Stack
- React
- Vite
- GitHub Pages
- JSZip
- Zustand planned for state persistence

## Current Features
- Country parser populates dropdown
- Add custom country flow
- Flag display/adding option
- Export functionality using exportMod.js
- Generates UISpecificCountriesInfos.ndf updates

## Important Files
- src/App.jsx
- src/export/exportMod.js
- src/generators/country.js

## Decisions Made
- Use parsed countries for dropdown
- Keep export functionality
- Likely move to Zustand + persist for project state

## Current Problems
- Context gets lost across chats
- Risk of duplicating builds
- Local copy may drift from GitHub edits

## Next Steps
1. Improve state management with Zustand persist
2. Define project shape for saved state
3. Refactor export pipeline to read from central store
 
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

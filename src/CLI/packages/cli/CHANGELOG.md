# Changelog

All notable changes to the Aether CLI will be documented in this file.

## [0.0.3] - 2026-04-12

### Changed
- Updated copyright headers to 2026 OEvortex
- Added fuzzy matching search to model dialog
- Fixed API key display in model dialog to show provider API key status

## [0.0.2] - 2025-04-12

### Changed
- **BREAKING**: Refactored CLI to exclusively use `providers` key for model configuration
- **BREAKING**: Removed legacy `modelProviders` key from settings schema
- **BREAKING**: Removed environment variable fallbacks for API keys and base URLs
- Credentials now only read from settings/providers configuration
- Models now inherit provider API keys when they don't have their own
- Updated error messages to reference "provider" instead of "modelProviders"
- Replaced "authType" with "sdkMode" in CLI model display
- Updated model credential resolution to use settings as sole source of truth

### Fixed
- Fixed TypeScript compilation errors related to modelProviders removal
- Fixed credential resolution for runtime-discovered models
- Fixed credential resolution for static models from provider catalogs

## [0.0.1] - Initial Release

---
'@bilbomd/mongodb-schema': patch
'@bilbomd/bilbomd-types': patch
'@bilbomd/backend': minor
'@bilbomd/scoper': patch
'@bilbomd/worker': patch
'@bilbomd/ui': minor
---

# Usage Analytics & Admin Dashboard

**Branch:** `238-store-job-stats-in-mongodb`  
**Target:** `main`

## 🎯 Core Feature: Usage Analytics & Admin Dashboard

Added comprehensive usage analytics infrastructure across the BilboMD stack:

- **📊 Analytics Dashboard:** New admin UI with interactive charts and KPI cards displaying job success rates, pipeline trends, duration statistics, and access mode splits
- **📝 Usage Event Tracking:** Job lifecycle events (submitted/started/completed/failed) stored in MongoDB with user context, IP hashing, and NERSC metadata  
- **🔌 Backend Analytics API:** Protected endpoints for aggregating usage statistics with role-based access control (Admin/Manager only)
- **⚡ Worker Pipeline Integration:** All job pipelines (auto/crd/pdb/sans/multi/scoper) now emit structured usage events

## 🏗️ Technical Implementation

### Database & Schema

- New `UsageEvent` MongoDB collection with optimized indexes for analytics queries
- Usage event interfaces and DTOs in shared packages

### Backend

- 9 new analytics controller endpoints under `/admin/analytics`
- Usage event service for centralized event recording
- Job submission tracking for both authenticated and anonymous users

### Frontend

- New RTK Query `analyticsApiSlice` for data fetching
- Responsive analytics dashboard with time-range filtering
- Complete test coverage for all analytics components

### Worker & Services

- Usage event emission across all pipeline services
- NERSC job monitoring with status tracking

## 🧪 Testing & Quality

- **Comprehensive test suite** for all new analytics components
- **Unit tests** for utility functions (dates, PDB utilities)  
- **Component tests** using Vitest with proper mocking patterns
- **Follows project standards** with functional components and TypeScript strict typing

## 📚 Documentation

- Usage analytics aggregation guide with MongoDB pipeline examples
- Updated Copilot instructions with testing best practices
- Detailed changeset documentation for future reference

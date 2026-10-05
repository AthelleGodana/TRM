# Task: Replace dropdowns with buttons + ensure admin interface

## Goals
1. Create reusable `ButtonSelect` component that renders buttons instead of `<select>` dropdowns. ✅
2. Replace every `<select>` dropdown across the app with `ButtonSelect`. ✅
3. Add role options (Student / Driver / Admin) to the Login page so anyone can log in. ✅
4. Verify admin interface covers: place new vehicles, view payments, access student & driver details. ✅

## Steps
- [x] Create `client/src/components/common/ButtonSelect.jsx`
- [x] Replace role dropdown in `client/src/pages/Signup.jsx` (student + driver only)
- [x] Replace dropdowns in `client/src/pages/admin/ManageBuses.jsx` (add form + assign modal)
- [x] Replace tier filter dropdown in `client/src/pages/admin/ManageStudents.jsx`
- [x] Replace tier dropdown in `client/src/pages/admin/ManageRoutes.jsx`
- [x] Replace status filter dropdown in `client/src/pages/admin/Payments.jsx`
- [x] Replace dropdowns in `client/src/pages/student/RegisterRoute.jsx`
- [x] Replace tier dropdown in `client/src/pages/student/Payments.jsx`
- [x] Add role option buttons to `client/src/pages/Login.jsx` (incl. Admin)
- [x] Build client to verify no errors — PASSED (3122 modules, 2m 21s)
</content>

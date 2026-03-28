import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import AdminHome from './pages/admin/AdminHome'
import AdminCentres from './pages/admin/AdminCentres'
import CentreRequests from './pages/admin/CentreRequests'
import AllocateDoses from './pages/admin/AllocateDoses'
import DoseRequests from './pages/admin/DoseRequests'
import ManagerHome from './pages/manager/ManagerHome'
import RequestCentre from './pages/manager/RequestCentre'
import CreateSlot from './pages/manager/CreateSlot'
import RequestStock from './pages/manager/RequestStock'
import AppointmentList from './pages/manager/AppointmentList'
import AllAppointments from './pages/manager/AllAppointments'
import VaccineList from './pages/manager/VaccineList'
import VaccinatedUsers from './pages/manager/VaccinatedUsers'
import CitizenDashboard from './pages/citizen/CitizenDashboard'
import BrowseSlots from './pages/citizen/BrowseSlots'
import CentreSlots from './pages/citizen/CentreSlots'
import CitizenProfile from './pages/citizen/CitizenProfile'
import Certificates from './pages/citizen/Certificates'
import VerifyCertificate from './pages/VerifyCertificate'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-certificate" element={<VerifyCertificate />} />

            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AdminHome />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/requests"
              element={
                <ProtectedRoute roles={['admin']}>
                  <CentreRequests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/centres"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AdminCentres />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/allocate-doses"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AllocateDoses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/dose-requests"
              element={
                <ProtectedRoute roles={['admin']}>
                  <DoseRequests />
                </ProtectedRoute>
              }
            />

            <Route
              path="/manager"
              element={
                <ProtectedRoute roles={['manager']}>
                  <ManagerHome />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/request-centre"
              element={
                <ProtectedRoute roles={['manager']}>
                  <RequestCentre />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/slots"
              element={
                <ProtectedRoute roles={['manager']}>
                  <CreateSlot />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/stock-requests"
              element={
                <ProtectedRoute roles={['manager']}>
                  <RequestStock />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/appointments"
              element={
                <ProtectedRoute roles={['manager']}>
                  <AppointmentList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/all-appointments"
              element={
                <ProtectedRoute roles={['manager']}>
                  <AllAppointments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/vaccines"
              element={
                <ProtectedRoute roles={['manager']}>
                  <VaccineList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/manager/vaccinated-users"
              element={
                <ProtectedRoute roles={['manager']}>
                  <VaccinatedUsers />
                </ProtectedRoute>
              }
            />

            <Route
              path="/citizen"
              element={
                <ProtectedRoute roles={['citizen']}>
                  <CitizenDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/citizen/browse"
              element={
                <ProtectedRoute roles={['citizen']}>
                  <BrowseSlots />
                </ProtectedRoute>
              }
            />
            <Route
              path="/centre/:id"
              element={
                <ProtectedRoute roles={['citizen']}>
                  <CentreSlots />
                </ProtectedRoute>
              }
            />
            <Route
              path="/citizen/profile"
              element={
                <ProtectedRoute roles={['citizen']}>
                  <CitizenProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/citizen/certificates"
              element={
                <ProtectedRoute roles={['citizen']}>
                  <Certificates />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

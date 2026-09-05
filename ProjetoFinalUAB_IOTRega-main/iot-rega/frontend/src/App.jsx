import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { FarmProvider } from './context/FarmContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Farms from './pages/Farms';
import PlotsMap from './pages/PlotsMap';
import Sensors from './pages/Sensors';
import SensorDetail from './pages/SensorDetail';
import Alerts from './pages/Alerts';
import Rules from './pages/Rules';
import Costs from './pages/Costs';
import Weather from './pages/Weather';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <FarmProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="farms" element={<Farms />} />
                <Route path="plots" element={<PlotsMap />} />
                <Route path="sensors" element={<Sensors />} />
                <Route path="sensors/:id" element={<SensorDetail />} />
                <Route path="alerts" element={<Alerts />} />
                <Route path="rules" element={<Rules />} />
                <Route path="costs" element={<Costs />} />
                <Route path="weather" element={<Weather />} />
                <Route path="profile" element={<Profile />} />
                <Route path="*" element={<NotFound />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </FarmProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

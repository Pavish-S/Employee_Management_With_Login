import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './index.css';
import AttendanceView from './components/AttendanceView';
import FaceCamera from './components/FaceCamera';

const API_BASE_URL = 'http://localhost:8000';

// Axios Interceptor for injecting JWT token
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [role, setRole] = useState(localStorage.getItem('role') || null);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  
  const [employees, setEmployees] = useState([]);
  const [formData, setFormData] = useState({ Name: '', Email: '', Department: '', PhoneNumber: '', Address: '', Salary: '' });
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [activeTab, setActiveTab] = useState('employees');
  const [registerFaceEmpId, setRegisterFaceEmpId] = useState(null);
  
  // Pagination & Search & Sort State
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(5);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('EmployeeId');
  const [order, setOrder] = useState('asc');

  useEffect(() => {
    if (token) {
      fetchEmployees();
    }
  }, [token, page, search, sortBy, order]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const params = new URLSearchParams();
      params.append('username', loginData.username);
      params.append('password', loginData.password);
      
      const response = await axios.post(`${API_BASE_URL}/token`, params);
      const accessToken = response.data.access_token;
      const userRole = response.data.role;
      
      setToken(accessToken);
      setRole(userRole);
      localStorage.setItem('token', accessToken);
      localStorage.setItem('role', userRole);
      // showMessage('success', `Logged in successfully as ${userRole}!`);
    } catch (error) {
      console.error(error);
      showMessage('error', 'Invalid username or password.');
    }
  };

 const handleLogout = async () => {
  try {
    await axios.post(`${API_BASE_URL}/logout`);
  } catch (err) {
    console.warn("Logout tracking failed");
  }

  setToken(null);
  setRole(null);
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  setEmployees([]);
};
  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/employees/`, {
        params: { search, page, limit, sort_by: sortBy, order }
      });
      setEmployees(response.data.data);
      setTotal(response.data.total);
    } catch (error) {
      if (error.response && error.response.status === 401) {
        handleLogout();
        showMessage('error', 'Session expired. Please log in again.');
      } else {
        showMessage('error', 'Failed to fetch employees.');
      }
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await axios.put(`${API_BASE_URL}/employees/${editingId}`, formData);
        showMessage('success', 'Employee updated successfully!');
      } else {
        await axios.post(`${API_BASE_URL}/employees/`, formData);
        showMessage('success', 'Employee added successfully!');
      }
      setFormData({ Name: '', Email: '', Department: '', PhoneNumber: '', Address: '', Salary: '' });
      setEditingId(null);
      fetchEmployees();
    } catch (error) {
      const msg = error.response?.data?.detail || 'An error occurred. Please check the inputs.';
      showMessage('error', typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const handleEdit = (emp) => {
    setFormData({
      Name: emp.Name,
      Email: emp.Email,
      Department: emp.Department,
      PhoneNumber: emp.PhoneNumber || '',
      Address: emp.Address || '',
      Salary: emp.Salary
    });
    setEditingId(emp.EmployeeId);
  };

  const handleCancel = () => {
    setFormData({ Name: '', Email: '', Department: '', PhoneNumber: '', Address: '', Salary: '' });
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      try {
        await axios.delete(`${API_BASE_URL}/employees/${id}`);
        showMessage('success', 'Employee deleted successfully!');
        if (employees.length === 1 && page > 1) {
          setPage(page - 1);
        } else {
          fetchEmployees();
        }
      } catch (error) {
        showMessage('error', 'Failed to delete employee.');
      }
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setOrder('asc');
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  if (!token) {
    return (
      <div className="login-container">
        <div className="card login-card">
          <div className="login-header">
            <h1>Welcome</h1>
            <p className="subtitle">Please sign in to access the directory</p>
          </div>
          
          {message.text && (
            <div className={`message ${message.type}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Username</label>
              <input type="text" value={loginData.username} onChange={(e) => setLoginData({...loginData, username: e.target.value})} required placeholder="Enter your username" />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={loginData.password} onChange={(e) => setLoginData({...loginData, password: e.target.value})} required placeholder="••••••••" />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem', padding: '0.875rem' }}>Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Employee Details</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ background: '#f1f5f9', padding: '0.25rem', borderRadius: '8px', display: 'flex' }}>
            <button 
              className={`btn ${activeTab === 'employees' ? 'btn-primary' : ''}`} 
              style={{ background: activeTab === 'employees' ? '' : 'transparent', color: activeTab === 'employees' ? '' : '#475569', boxShadow: activeTab === 'employees' ? '' : 'none' }}
              onClick={() => setActiveTab('employees')}
            >
              Directory
            </button>
            <button 
              className={`btn ${activeTab === 'attendance' ? 'btn-primary' : ''}`}
              style={{ background: activeTab === 'attendance' ? '' : 'transparent', color: activeTab === 'attendance' ? '' : '#475569', boxShadow: activeTab === 'attendance' ? '' : 'none' }}
              onClick={() => setActiveTab('attendance')}
            >
              Attendance
            </button>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary">Logout</button>
        </div>
      </header>

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {registerFaceEmpId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Register Face</h2>
            <FaceCamera 
              endpoint={`${API_BASE_URL}/attendance/register-face/${registerFaceEmpId}`}
              onSuccess={(data) => {
                showMessage('success', data.message);
                setRegisterFaceEmpId(null);
              }}
              onError={(msg) => {
                showMessage('error', msg);
                setRegisterFaceEmpId(null);
              }}
              buttonText="Capture & Register"
            />
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => setRegisterFaceEmpId(null)}>Cancel</button>
          </div>
        </div>
      )}

      {activeTab === 'attendance' ? (
        <AttendanceView showMessage={showMessage} />
      ) : (
      <div className="dashboard" style={{ gridTemplateColumns: role === 'Admin' ? undefined : '1fr' }}>
        
        {role === 'Admin' && (
          <section className="card">
            <h2>{editingId ? 'Edit Employee' : 'Add New Employee'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid-2">
                <div className="form-group">
                  <label>Full Name</label>
                  <input type="text" name="Name" value={formData.Name} onChange={handleChange} required placeholder="John Doe" />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" name="Email" value={formData.Email} onChange={handleChange} required placeholder="john@example.com" />
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <input type="text" name="Department" value={formData.Department} onChange={handleChange} required placeholder="Engineering" />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input type="text" name="PhoneNumber" value={formData.PhoneNumber} onChange={handleChange} placeholder="555-0123" />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <input type="text" name="Address" value={formData.Address} onChange={handleChange} placeholder="123 Main St" />
                </div>
                <div className="form-group">
                  <label>Salary</label>
                  <input type="number" name="Salary" value={formData.Salary} onChange={handleChange} required min="0" step="0.01" placeholder="75000" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary">
                  {editingId ? 'Update Employee' : 'Create Employee'}
                </button>
                {editingId && (
                  <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>
        )}

        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ marginBottom: 0 }}>Employee Details</h2>
            <input 
              type="text" 
              placeholder="Search by Name, Dept, Email..." 
              value={search} 
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ width: '250px' }}
            />
          </div>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th onClick={() => handleSort('EmployeeId')} style={{ cursor: 'pointer' }}>
                    ID {sortBy === 'EmployeeId' ? (order === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => handleSort('Name')} style={{ cursor: 'pointer' }}>
                    Name {sortBy === 'Name' ? (order === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Phone Number</th>
                  <th>Address</th>
                  
                  {role === 'Admin' && (
                    <th onClick={() => handleSort('Salary')} style={{ cursor: 'pointer' }}>
                      Salary {sortBy === 'Salary' ? (order === 'asc' ? '↑' : '↓') : ''}
                    </th>
                  )}
                  {role === 'Admin' && <th>Actions</th>}
                  
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={role === 'Admin' ? 8 : 6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0' }}>
                      No employees found.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.EmployeeId}>
                      <td style={{ color: 'var(--text-muted)' }}>#{emp.EmployeeId}</td>
                      <td style={{ fontWeight: 500, color: 'var(--text)' }}>{emp.Name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{emp.Email}</td>
                      <td>
                        <span style={{ 
                          background: '#EFF6FF', 
                          color: '#1D4ED8', 
                          padding: '0.25rem 0.625rem', 
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          {emp.Department}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{emp.PhoneNumber || '-'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{emp.Address || '-'}</td>
                      
                      {role === 'Admin' && (
                        <td style={{ fontWeight: 500, color: '#059669' }}>
                          ${emp.Salary !== null ? parseFloat(emp.Salary).toLocaleString() : ''}
                        </td>
                      )}
                      
                      {role === 'Admin' && (
                        <td className="actions">
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                            title="Edit employee"
                            onClick={() => handleEdit(emp)}
                          >
                            Edit
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', background: '#e0e7ff', color: '#4338ca' }} onClick={() => setRegisterFaceEmpId(emp.EmployeeId)}>Face</button>
                          <button className="btn btn-danger" style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }} onClick={() => handleDelete(emp.EmployeeId)}>Delete</button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {total > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} employees
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.5rem 1rem' }}
                  disabled={page === 1} 
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.5rem 1rem' }}
                  disabled={page >= totalPages} 
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      )}
    </div>
  );
}

export default App;

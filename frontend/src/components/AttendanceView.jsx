import React, { useState, useEffect } from 'react';
import axios from 'axios';
import FaceCamera from './FaceCamera';

const API_BASE_URL = 'http://localhost:8000';

const AttendanceView = ({ showMessage }) => {
  const [attendance, setAttendance] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [showCamera, setShowCamera] = useState(false);
  const [results, setResults] = useState([]);

  useEffect(() => {
    fetchAttendance();
  }, [page]);

  const fetchAttendance = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/attendance/`, {
        params: { page, limit }
      });
      setAttendance(response.data.data);
      setTotal(response.data.total);
    } catch (error) {
      showMessage('error', 'Failed to fetch attendance.');
    }
  };

  const handleMarkSuccess = (data) => {
    setShowCamera(false);
    if (data.results && data.results.length > 0) {
      const msg = data.results.map(r => `${r.name}: ${r.status}`).join(', ');
      showMessage('success', msg);
    } else {
      showMessage('success', 'Attendance marked successfully');
    }
    setResults(data.results);
    fetchAttendance();
  };

  const handleMarkError = (msg) => {
    showMessage('error', msg);
    setShowCamera(false);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="attendance-view" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ marginBottom: 0 }}>Face Attendance</h2>
          <button className="btn btn-primary" onClick={() => setShowCamera(!showCamera)}>
            {showCamera ? 'Cancel Camera' : 'Mark Attendance (Camera)'}
          </button>
        </div>

        {showCamera && (
          <div style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: '#f8fafc' }}>
            <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>Position your face in the camera</h3>
            <FaceCamera 
              endpoint={`${API_BASE_URL}/attendance/mark`}
              onSuccess={handleMarkSuccess}
              onError={handleMarkError}
              buttonText="Mark Attendance"
            />
          </div>
        )}

        {results.length > 0 && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#d1fae5', borderRadius: '8px' }}>
            <h4>Recent Recognitions:</h4>
            <ul>
              {results.map((r, i) => <li key={i}>{r.name} - <strong>{r.status}</strong></li>)}
            </ul>
          </div>
        )}

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Employee Name</th>
                <th>Date</th>
                <th>Login Time</th>
                <th>Logout Time</th>
              </tr>
            </thead>
            <tbody>
              {attendance.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0' }}>
                    No attendance records found.
                  </td>
                </tr>
              ) : (
                attendance.map((record) => (
                  <tr key={record.AttendanceId}>
                    <td style={{ color: 'var(--text-muted)' }}>#{record.EmployeeId}</td>
                    <td style={{ fontWeight: 500, color: 'var(--text)' }}>{record.EmployeeName}</td>
                    <td>{record.Date}</td>
                    <td>
                      <span style={{ background: '#d1fae5', color: '#065f46', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                        {record.LoginTime}
                      </span>
                    </td>
                    <td>
                      {record.LogoutTime ? (
                        <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                          {record.LogoutTime}
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} records
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
  );
};

export default AttendanceView;

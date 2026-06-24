import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';

const FaceCamera = ({ endpoint, onSuccess, onError, buttonText }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      onError('Unable to access camera');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const captureAndSend = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsLoading(true);
    const context = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) {
        setIsLoading(false);
        onError('Could not capture image');
        return;
      }
      
      const formData = new FormData();
      formData.append('file', blob, 'face.jpg');
      
      try {
        const response = await axios.post(endpoint, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        onSuccess(response.data);
      } catch (error) {
        const msg = error.response?.data?.detail || 'Face processing failed';
        onError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      } finally {
        setIsLoading(false);
      }
    }, 'image/jpeg');
  };

  return (
    <div className="face-camera-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: '400px', borderRadius: '8px', overflow: 'hidden', background: '#000' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button onClick={captureAndSend} disabled={isLoading || !stream} className="btn btn-primary">
          {isLoading ? 'Processing...' : buttonText}
        </button>
      </div>
    </div>
  );
};

export default FaceCamera;

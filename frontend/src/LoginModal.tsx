import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Lock, User, LogIn } from "lucide-react";

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Dummy authentication for portfolio purposes
    localStorage.setItem("isAuthenticated", "true");
    onClose();
    navigate("/dashboard");
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel">
        <button className="close-button" onClick={onClose}>
          <X size={20} />
        </button>
        
        <div className="modal-header">
          <h2>Welcome Back</h2>
          <p>Sign in to access the Impact Lab workspace.</p>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <div className="input-with-icon">
              <User size={18} />
              <input 
                id="username"
                type="text" 
                placeholder="portfolio_reviewer" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>
          
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <Lock size={18} />
              <input 
                id="password"
                type="password" 
                placeholder="Enter any password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="primary-button full-width">
            Access Workspace <LogIn size={18} />
          </button>
          
          <div className="login-hint">
            <p>Demo Mode: Any credentials will work.</p>
          </div>
        </form>
      </div>
    </div>
  );
}

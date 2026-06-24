CREATE DATABASE IF NOT EXISTS employee_db;
USE employee_db;

CREATE TABLE IF NOT EXISTS Employee (
    EmployeeId INT AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(100) NOT NULL,
    Email VARCHAR(150) NOT NULL UNIQUE,
    Department VARCHAR(100) NOT NULL,
    PhoneNumber VARCHAR(20) DEFAULT NULL,
    Address TEXT DEFAULT NULL,
    Salary DECIMAL(10, 2) NOT NULL CHECK (Salary >= 0),
    CreatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Users (
    UserId INT AUTO_INCREMENT PRIMARY KEY,
    Username VARCHAR(50) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    Role ENUM('Admin', 'User') DEFAULT 'User'
);

-- Insert a default admin user (password is 'admin')
INSERT IGNORE INTO Users (Username, PasswordHash, Role) VALUES ('admin', 'admin', 'Admin');

-- Insert a default regular user
INSERT IGNORE INTO Users (Username, PasswordHash, Role) VALUES ('Pavish', 'Welcome@123', 'User');

CREATE TABLE IF NOT EXISTS UserLoginHistory (
    HistoryId INT AUTO_INCREMENT PRIMARY KEY,
    Username VARCHAR(50),
    LoginTime DATETIME,
    LogoutTime DATETIME,
    FOREIGN KEY (Username) REFERENCES Users(Username) ON DELETE CASCADE
);

-- Add FaceEncoding to Employee table
ALTER TABLE Employee ADD COLUMN FaceEncoding LONGTEXT DEFAULT NULL;

-- Create Attendance table
CREATE TABLE IF NOT EXISTS Attendance (
    AttendanceId INT AUTO_INCREMENT PRIMARY KEY,
    EmployeeId INT NOT NULL,
    EmployeeName VARCHAR(100) NOT NULL,
    Date DATE NOT NULL,
    LoginTime TIME NOT NULL,
    LogoutTime TIME DEFAULT NULL,
    UNIQUE(EmployeeId, Date),
    FOREIGN KEY (EmployeeId) REFERENCES Employee(EmployeeId) ON DELETE CASCADE
);



import os
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Depends, Query, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
import pymysql
from fastapi.middleware.cors import CORSMiddleware
import jwt
import bcrypt
import cv2
import numpy as np
from fastapi import UploadFile, File
import base64

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
app = FastAPI(title="Employee Management API")

# Allow frontend to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection configuration (use env vars)
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "employee_db")

def get_db():
    conn = pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor
    )
    try:
        yield conn
    finally:
        conn.close()


# --- Security & JWT Config ---
SECRET_KEY = os.getenv("JWT_SECRET", "supersecretkey")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password: str, hashed_password: str):
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        # Fallback for plain-text passwords manually inserted into the database
        return plain_password == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        if username is None or role is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
        
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM Users WHERE Username = %s", (username,))
        user = cursor.fetchone()
        if user is None:
            raise credentials_exception
            
    return {"username": user["Username"], "role": user["Role"]}

def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "Admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user

# --- Pydantic Models ---
class EmployeeBase(BaseModel):
    Name: str
    Email: EmailStr
    Department: str
    PhoneNumber: Optional[str] = None
    Address: Optional[str] = None
    Salary: Optional[float] = None

class EmployeeCreate(EmployeeBase):
    Salary: float

class EmployeeUpdate(EmployeeBase):
    Salary: float

class EmployeeResponse(EmployeeBase):
    EmployeeId: int
    CreatedDate: datetime

class PaginatedEmployeeResponse(BaseModel):
    data: List[EmployeeResponse]
    total: int
    page: int
    limit: int

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str

class AttendanceResponse(BaseModel):
    AttendanceId: int
    EmployeeId: int
    EmployeeName: str
    Date: str
    LoginTime: str
    LogoutTime: Optional[str] = None


class PaginatedAttendanceResponse(BaseModel):
    data: List[AttendanceResponse]
    total: int
    page: int
    limit: int

# --- Authentication Endpoint ---
@app.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db = Depends(get_db)
):
    with db.cursor() as cursor:
        cursor.execute(
            "SELECT * FROM Users WHERE Username = %s",
            (form_data.username,)
        )
        user = cursor.fetchone()

    if not user or not verify_password(form_data.password, user['PasswordHash']):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["Username"], "role": user["Role"]},
        expires_delta=access_token_expires
    )

    # --- Track Login Time ---
    with db.cursor() as cursor:
        cursor.execute(
            "INSERT INTO UserLoginHistory (Username, LoginTime) VALUES (%s, NOW())",
            (user["Username"],)
        )
    db.commit()

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user["Role"]
    }

@app.post("/logout")
def logout(current_user = Depends(get_current_user), db = Depends(get_db)):
    with db.cursor() as cursor:
        cursor.execute("""
            UPDATE UserLoginHistory
            SET LogoutTime = NOW()
            WHERE Username = %s AND LogoutTime IS NULL
            ORDER BY LoginTime DESC
            LIMIT 1
        """, (current_user["username"],))
    db.commit()
    return {"message": "Logged out successfully"}

# --- API Endpoints ---
@app.post("/employees/", status_code=201)
def add_employee(emp: EmployeeCreate, db = Depends(get_db), current_user = Depends(require_admin)):
    try:
        with db.cursor() as cursor:
            sql = "INSERT INTO Employee (Name, Email, Department, Salary, PhoneNumber, Address) VALUES (%s, %s, %s, %s, %s, %s)"
            cursor.execute(sql, (emp.Name, emp.Email, emp.Department, emp.Salary, emp.PhoneNumber, emp.Address))
        db.commit()
        return {"message": "Employee created successfully"}
    except pymysql.MySQLError as e:
        raise HTTPException(status_code=400, detail=f"Database error: {e}")

@app.get("/employees/", response_model=PaginatedEmployeeResponse)
def list_employees(
    search: Optional[str] = None,
    sort_by: Optional[str] = Query("EmployeeId", pattern="^(EmployeeId|Name|Salary)$"),
    order: Optional[str] = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db = Depends(get_db),
    current_user = Depends(get_current_user)
):
    offset = (page - 1) * limit
    
    query = "SELECT * FROM Employee"
    count_query = "SELECT COUNT(*) as total FROM Employee"
    params = []
    where_clauses = []
    
    if current_user["role"] == "User":
        where_clauses.append("Name = %s")
        params.append(current_user["username"])
    
    if search:
        search_term = f"%{search}%"
        where_clauses.append("(Name LIKE %s OR Department LIKE %s OR Email LIKE %s)")
        params.extend([search_term, search_term, search_term])
        
    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)
        count_query += " WHERE " + " AND ".join(where_clauses)
        
    query += f" ORDER BY {sort_by} {order.upper()} LIMIT %s OFFSET %s"
    
    with db.cursor() as cursor:
        cursor.execute(count_query, params)
        total = cursor.fetchone()['total']
        
        params.extend([limit, offset])
        cursor.execute(query, params)
        data = cursor.fetchall()
        
    # RBAC: Hide salary for regular users
    if current_user["role"] == "User":
        for emp in data:
            emp["Salary"] = None
            
    return {"data": data, "total": total, "page": page, "limit": limit}

@app.get("/employees/{emp_id}")
def get_employee(emp_id: int, db = Depends(get_db), current_user = Depends(get_current_user)):
    with db.cursor() as cursor:
        cursor.execute("SELECT * FROM Employee WHERE EmployeeId = %s", (emp_id,))
        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Employee not found")
            
        if current_user["role"] == "User":
            result["Salary"] = None
            
        return result

@app.put("/employees/{emp_id}")
def update_employee(emp_id: int, emp: EmployeeUpdate, db = Depends(get_db), current_user = Depends(require_admin)):
    try:
        with db.cursor() as cursor:
            sql = "UPDATE Employee SET Name=%s, Email=%s, Department=%s, Salary=%s, PhoneNumber=%s, Address=%s WHERE EmployeeId=%s"
            affected_rows = cursor.execute(sql, (emp.Name, emp.Email, emp.Department, emp.Salary, emp.PhoneNumber, emp.Address, emp_id))
            if affected_rows == 0:
                raise HTTPException(status_code=404, detail="Employee not found")
        db.commit()
        return {"message": "Employee updated successfully"}
    except pymysql.MySQLError as e:
        raise HTTPException(status_code=400, detail=f"Database error: {e}")

@app.delete("/employees/{emp_id}", status_code=204)
def delete_employee(emp_id: int, db = Depends(get_db), current_user = Depends(require_admin)):
    with db.cursor() as cursor:
        affected_rows = cursor.execute("DELETE FROM Employee WHERE EmployeeId = %s", (emp_id,))
        if affected_rows == 0:
            raise HTTPException(status_code=404, detail="Employee not found")
    db.commit()

# --- Face Attendance Endpoints ---
@app.post("/attendance/register-face/{emp_id}")
async def register_face(emp_id: int, file: UploadFile = File(...), db = Depends(get_db), current_user = Depends(require_admin)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image file")
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    
    if len(faces) == 0:
        raise HTTPException(status_code=400, detail="No face found in image")
    if len(faces) > 1:
        raise HTTPException(status_code=400, detail="Multiple faces found. Please upload an image with only one face.")
    
    (x, y, w, h) = faces[0]
    face_roi = gray[y:y+h, x:x+w]
    face_roi = cv2.resize(face_roi, (100, 100))
    
    _, buffer = cv2.imencode('.jpg', face_roi)
    encoding_str = base64.b64encode(buffer).decode('utf-8')
    
    with db.cursor() as cursor:
        affected = cursor.execute("UPDATE Employee SET FaceEncoding = %s WHERE EmployeeId = %s", (encoding_str, emp_id))
        if affected == 0:
            raise HTTPException(status_code=404, detail="Employee not found")
    db.commit()
    return {"message": "Face registered successfully"}

@app.post("/attendance/mark")
async def mark_attendance(file: UploadFile = File(...), db = Depends(get_db)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image")
        
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    
    if len(faces) == 0:
        raise HTTPException(status_code=400, detail="No face found")
        
    with db.cursor() as cursor:
        cursor.execute("SELECT EmployeeId, Name, FaceEncoding FROM Employee WHERE FaceEncoding IS NOT NULL")
        employees = cursor.fetchall()
        
    if not employees:
        raise HTTPException(status_code=404, detail="No registered faces found")
        
    images = []
    labels = []
    id_to_name = {}
    
    for emp in employees:
        emp_id = emp['EmployeeId']
        b64_str = emp['FaceEncoding']
        try:
            if b64_str.startswith('['): continue
            
            img_data = base64.b64decode(b64_str)
            nparr_face = np.frombuffer(img_data, np.uint8)
            face_img = cv2.imdecode(nparr_face, cv2.IMREAD_GRAYSCALE)
            images.append(face_img)
            labels.append(emp_id)
            id_to_name[emp_id] = emp['Name']
        except Exception:
            continue
            
    if not images:
        raise HTTPException(status_code=404, detail="No valid registered faces found to compare")
        
    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.train(images, np.array(labels))
    
    recognized_names = []
    
    for (x, y, w, h) in faces:
        face_roi = gray[y:y+h, x:x+w]
        face_roi = cv2.resize(face_roi, (100, 100))
        label, confidence = recognizer.predict(face_roi)
        
        if confidence < 100:
            emp_id = label
            emp_name = id_to_name.get(emp_id, "Unknown")
            
            current_date = datetime.now().date()
            current_time = datetime.now().time()
            
            try:
                with db.cursor() as cursor:
                    cursor.execute("SELECT AttendanceId, LogoutTime FROM Attendance WHERE EmployeeId=%s AND Date=%s", (emp_id, current_date))
                    att = cursor.fetchone()
                    if att:
                        if att['LogoutTime'] is None:
                            cursor.execute("UPDATE Attendance SET LogoutTime=%s WHERE AttendanceId=%s", (current_time, att['AttendanceId']))
                            db.commit()
                            recognized_names.append({"name": emp_name, "status": "Logged Out"})
                        else:
                            recognized_names.append({"name": emp_name, "status": "Already Logged Out"})
                    else:
                        cursor.execute(
                            "INSERT INTO Attendance (EmployeeId, EmployeeName, Date, LoginTime) VALUES (%s, %s, %s, %s)",
                            (emp_id, emp_name, current_date, current_time)
                        )
                        db.commit()
                        recognized_names.append({"name": emp_name, "status": "Logged In"})
            except pymysql.MySQLError as e:
                pass
                
    if not recognized_names:
        raise HTTPException(status_code=404, detail="Face not recognized or confidence too low")
        
    return {"results": recognized_names}

@app.get("/attendance/", response_model=PaginatedAttendanceResponse)
def list_attendance(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db = Depends(get_db),
    current_user = Depends(get_current_user)
):
    offset = (page - 1) * limit
    
    query = "SELECT * FROM Attendance"
    count_query = "SELECT COUNT(*) as total FROM Attendance"
    params = []
    
    if current_user["role"] == "User":
        query += " WHERE EmployeeName = %s"
        count_query += " WHERE EmployeeName = %s"
        params.append(current_user["username"])
        
    query += " ORDER BY Date DESC, LoginTime DESC LIMIT %s OFFSET %s"
    
    with db.cursor() as cursor:
        cursor.execute(count_query, params)
        total = cursor.fetchone()['total']
        
        params.extend([limit, offset])
        cursor.execute(query, params)
        data = cursor.fetchall()
        
    for row in data:
        row['Date'] = str(row['Date'])
        row['LoginTime'] = str(row['LoginTime'])
        row['LogoutTime'] = str(row['LogoutTime']) if row['LogoutTime'] else None
        
    return {"data": data, "total": total, "page": page, "limit": limit}



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

class RoutineManager {
    constructor() {
        this.routines = this.loadRoutines();
        this.autoSaveEnabled = true;
        this.autoSaveInterval = null;
        this.lastSavedData = null;
        this.memo = this.loadMemo();
        this.init();
    }

    init() {
        this.updateDate();
        this.renderRoutines();
        this.updateStats();
        this.renderMemo();
        this.bindEvents();
        this.updateAutoSaveButton(this.autoSaveEnabled);
        this.lastSavedData = JSON.stringify(this.routines);
        
        // 매분마다 시간 업데이트
        setInterval(() => {
            this.updateDate();
        }, 60000);
    }

    bindEvents() {
        const form = document.getElementById('routine-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addRoutine();
        });

        // 메모 자동 저장 (입력 중일 때)
        const memoTextarea = document.getElementById('daily-memo');
        if (memoTextarea) {
            memoTextarea.addEventListener('input', () => {
                this.autoSaveMemo();
            });
        }
    }

    updateDate() {
        const now = new Date();
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            weekday: 'long'
        };
        const dateString = now.toLocaleDateString('ko-KR', options);
        document.getElementById('current-date').textContent = dateString;
    }

    addRoutine() {
        const name = document.getElementById('routine-name').value.trim();
        const time = document.getElementById('routine-time').value;
        const category = document.getElementById('routine-category').value;

        if (!name || !time) {
            alert('루틴 이름과 시간을 모두 입력해주세요.');
            return;
        }

        const routine = {
            id: Date.now(),
            name,
            time,
            category,
            completed: false,
            createdAt: new Date().toISOString()
        };

        this.routines.push(routine);
        this.saveRoutines();
        this.renderRoutines();
        this.updateStats();
        this.resetForm();
    }

    resetForm() {
        document.getElementById('routine-form').reset();
    }

    toggleComplete(routineId) {
        const routine = this.routines.find(r => r.id === routineId);
        if (routine) {
            routine.completed = !routine.completed;
            this.saveRoutines();
            this.renderRoutines();
            this.updateStats();
        }
    }

    deleteRoutine(routineId) {
        if (confirm('정말로 이 루틴을 삭제하시겠습니까?')) {
            this.routines = this.routines.filter(r => r.id !== routineId);
            this.saveRoutines();
            this.renderRoutines();
            this.updateStats();
        }
    }

    editRoutine(routineId) {
        const routine = this.routines.find(r => r.id === routineId);
        if (!routine) return;

        const newName = prompt('새로운 루틴 이름을 입력하세요:', routine.name);
        if (newName && newName.trim() !== '') {
            routine.name = newName.trim();
            this.saveRoutines();
            this.renderRoutines();
        }
    }

    renderRoutines() {
        const container = document.getElementById('routines-container');
        
        if (this.routines.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>아직 루틴이 없습니다</h3>
                    <p>새로운 루틴을 추가해보세요!</p>
                </div>
            `;
            return;
        }

        // 시간순으로 정렬
        const sortedRoutines = [...this.routines].sort((a, b) => {
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            return a.time.localeCompare(b.time);
        });

        container.innerHTML = sortedRoutines.map(routine => this.createRoutineCard(routine)).join('');
    }

    createRoutineCard(routine) {
        const categoryEmojis = {
            morning: '🌅',
            work: '💼',
            exercise: '🏃',
            study: '📚',
            evening: '🌙',
            other: '📝'
        };

        const categoryNames = {
            morning: '아침',
            work: '업무',
            exercise: '운동',
            study: '공부',
            evening: '저녁',
            other: '기타'
        };

        return `
            <div class="routine-card ${routine.completed ? 'completed' : ''}">
                <div class="routine-header">
                    <div class="routine-name">${routine.name}</div>
                    <div class="routine-category">
                        ${categoryEmojis[routine.category]} ${categoryNames[routine.category]}
                    </div>
                    <div class="routine-time">${routine.time}</div>
                </div>
                <div class="routine-actions">
                    <button class="btn btn-complete" onclick="routineManager.toggleComplete(${routine.id})">
                        ${routine.completed ? '완료 취소' : '완료'}
                    </button>
                    <button class="btn btn-edit" onclick="routineManager.editRoutine(${routine.id})">
                        수정
                    </button>
                    <button class="btn btn-delete" onclick="routineManager.deleteRoutine(${routine.id})">
                        삭제
                    </button>
                </div>
            </div>
        `;
    }

    updateStats() {
        const total = this.routines.length;
        const completed = this.routines.filter(r => r.completed).length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        document.getElementById('total-routines').textContent = total;
        document.getElementById('completed-routines').textContent = completed;
        document.getElementById('completion-rate').textContent = `${completionRate}%`;
    }

    saveRoutines() {
        localStorage.setItem('daily-routines', JSON.stringify(this.routines));
        this.checkAndSaveToFile();
    }

    loadRoutines() {
        const saved = localStorage.getItem('daily-routines');
        return saved ? JSON.parse(saved) : [];
    }

    // 변경사항 확인 및 저장
    checkAndSaveToFile() {
        if (!this.autoSaveEnabled) {
            return;
        }

        const currentData = JSON.stringify(this.routines);
        if (currentData !== this.lastSavedData) {
            // 자동 저장은 로컬 스토리지만 업데이트
            this.lastSavedData = currentData;
            this.updateAutoSaveStatus();
        }
    }

    // 로컬 파일로 저장
    saveToLocalFile() {
        try {
            const data = {
                routines: this.routines,
                lastSaved: new Date().toISOString(),
                version: '1.0',
                autoSave: true
            };

            const jsonString = JSON.stringify(data, null, 2);
            
            // 자동 저장은 다운로드 방식만 사용
            this.saveWithDownload(jsonString);
            this.updateAutoSaveStatus();
            
        } catch (error) {
            console.error('파일 저장 중 오류 발생:', error);
            this.showNotification('파일 저장 중 오류가 발생했습니다.', 'error');
        }
    }

    // File System Access API로 저장
    async saveWithFileSystemAPI(jsonString) {
        try {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: 'daily-routines.json',
                types: [{
                    description: 'JSON files',
                    accept: { 'application/json': ['.json'] }
                }]
            });
            
            const writable = await fileHandle.createWritable();
            await writable.write(jsonString);
            await writable.close();
            
            this.showNotification('파일이 성공적으로 저장되었습니다!', 'success');
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('File System API 저장 실패:', error);
                this.saveWithDownload(jsonString);
            }
        }
    }

    // 다운로드 방식으로 저장
    saveWithDownload(jsonString) {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'daily-routines.json';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 자동 저장 토글
    toggleAutoSave() {
        this.autoSaveEnabled = !this.autoSaveEnabled;
        if (this.autoSaveEnabled) {
            this.updateAutoSaveButton(true);
            this.showNotification('자동 업데이트가 활성화되었습니다.', 'success');
        } else {
            this.updateAutoSaveButton(false);
            this.showNotification('자동 업데이트가 비활성화되었습니다.', 'warning');
        }
    }

    // 자동 저장 버튼 상태 업데이트
    updateAutoSaveButton(isActive) {
        const button = document.getElementById('autosave-toggle');
        const status = document.getElementById('autosave-status');
        
        if (isActive) {
            button.textContent = '🔄 자동 업데이트 끄기';
            button.classList.add('active');
            status.textContent = '자동 업데이트: 활성화';
        } else {
            button.textContent = '🔄 자동 업데이트 켜기';
            button.classList.remove('active');
            status.textContent = '자동 업데이트: 비활성화';
        }
    }


    // 자동 저장 상태 업데이트
    updateAutoSaveStatus() {
        const statusElement = document.getElementById('autosave-status');
        if (statusElement) {
            const now = new Date();
            const timeString = now.toLocaleTimeString('ko-KR');
            statusElement.textContent = `마지막 업데이트: ${timeString}`;
            statusElement.style.color = '#48bb78';
            
            // 2초 후 색상 원래대로
            setTimeout(() => {
                statusElement.style.color = '#718096';
            }, 2000);
        }
    }

    // 수동 저장 (사용자가 직접 저장 버튼 클릭)
    manualSave() {
        try {
            const data = {
                routines: this.routines,
                lastSaved: new Date().toISOString(),
                version: '1.0',
                autoSave: false
            };

            const jsonString = JSON.stringify(data, null, 2);
            
            // File System Access API 사용 (사용자 제스처가 있을 때)
            if ('showSaveFilePicker' in window) {
                this.saveWithFileSystemAPI(jsonString);
            } else {
                // 폴백: 다운로드 방식
                this.saveWithDownload(jsonString);
            }
            
            this.lastSavedData = JSON.stringify(this.routines);
            this.updateAutoSaveStatus();
            
        } catch (error) {
            console.error('수동 저장 중 오류 발생:', error);
            this.showNotification('저장 중 오류가 발생했습니다.', 'error');
        }
    }

    // 메모 로드
    loadMemo() {
        const today = new Date().toDateString();
        const saved = localStorage.getItem(`daily-memo-${today}`);
        return saved || '';
    }

    // 메모 저장
    saveMemo() {
        const memoTextarea = document.getElementById('daily-memo');
        if (memoTextarea) {
            this.memo = memoTextarea.value;
            const today = new Date().toDateString();
            localStorage.setItem(`daily-memo-${today}`, this.memo);
            this.showNotification('메모가 저장되었습니다!', 'success');
        }
    }

    // 메모 지우기
    clearMemo() {
        if (confirm('메모를 지우시겠습니까?')) {
            const memoTextarea = document.getElementById('daily-memo');
            if (memoTextarea) {
                memoTextarea.value = '';
                this.memo = '';
                const today = new Date().toDateString();
                localStorage.removeItem(`daily-memo-${today}`);
                this.showNotification('메모가 지워졌습니다!', 'warning');
            }
        }
    }

    // 메모 렌더링
    renderMemo() {
        const memoTextarea = document.getElementById('daily-memo');
        if (memoTextarea) {
            memoTextarea.value = this.memo;
        }
    }

    // 메모 자동 저장
    autoSaveMemo() {
        const memoTextarea = document.getElementById('daily-memo');
        if (memoTextarea) {
            this.memo = memoTextarea.value;
            const today = new Date().toDateString();
            localStorage.setItem(`daily-memo-${today}`, this.memo);
        }
    }

    // 하루가 지나면 루틴 초기화 (선택사항)
    checkNewDay() {
        const today = new Date().toDateString();
        const lastCheck = localStorage.getItem('last-routine-check');
        
        if (lastCheck !== today) {
            // 하루가 지났으므로 완료 상태 초기화
            this.routines.forEach(routine => {
                routine.completed = false;
            });
            this.saveRoutines();
            localStorage.setItem('last-routine-check', today);
            this.renderRoutines();
            this.updateStats();
        }
    }
}

// 앱 초기화
let routineManager;

document.addEventListener('DOMContentLoaded', () => {
    routineManager = new RoutineManager();
    
    // 하루가 지났는지 확인
    routineManager.checkNewDay();
});

// 키보드 단축키
document.addEventListener('keydown', (e) => {
    // Ctrl + Enter로 루틴 추가
    if (e.ctrlKey && e.key === 'Enter') {
        const form = document.getElementById('routine-form');
        form.dispatchEvent(new Event('submit'));
    }
    
    // ESC로 폼 초기화
    if (e.key === 'Escape') {
        routineManager.resetForm();
    }
});

// 페이지 가시성 변경 시 통계 업데이트
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && routineManager) {
        routineManager.updateStats();
    }
});

class RoutineManager {
    constructor() {
        // Supabase 클라이언트 초기화
        this.supabaseUrl = 'https://nqwjvrznwzmfytjlpfsk.supabase.co';
        this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xd2p2cnpud3ptZnl0amxwZnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNzA4NTEsImV4cCI6MjA3Mzk0Njg1MX0.R3Y2Xb9PmLr3sCLSdJov4Mgk1eAmhaCIPXEKq6u8NQI';
        
        // Supabase 클라이언트 초기화 확인
        if (typeof supabase === 'undefined') {
            console.error('Supabase 클라이언트가 로드되지 않았습니다. 스크립트 로딩 순서를 확인해주세요.');
            this.showNotification('Supabase 클라이언트 로딩 오류', 'error');
            return;
        }
        
        this.supabase = supabase.createClient(this.supabaseUrl, this.supabaseKey);
        
        // 디버깅 정보
        console.log('Supabase URL:', this.supabaseUrl);
        console.log('Supabase Key (첫 20자):', this.supabaseKey.substring(0, 20) + '...');
        console.log('Supabase 클라이언트:', this.supabase);
        
        this.routines = [];
        this.routineCompletions = new Map(); // 루틴 완료 상태를 저장하는 Map
        this.autoSaveEnabled = true;
        this.autoSaveInterval = null;
        this.lastSavedData = null;
        this.memo = '';
        
        // 알림 관련 속성
        this.notificationsEnabled = false;
        this.notificationPermission = 'default';
        this.notificationCheckInterval = null;
        this.lastNotificationDate = null;
        this.notificationTimes = [
            { hour: 11, minute: 0, label: '오전 11시' },    // 오전 11시
            { hour: 13, minute: 30, label: '오후 1시 30분' } // 오후 1시 30분
        ];
        this.sentNotifications = new Set(); // 오늘 보낸 알림 시간 추적
        
        this.init();
    }

    async init() {
        this.updateDate();
        
        // Supabase 연결 테스트
        try {
            const { data, error } = await this.supabase
                .from('routines')
                .select('id')
                .limit(1);
            
            if (error) {
                console.error('Supabase 연결 테스트 실패:', error);
                console.error('오류 상세:', error);
                this.showNotification('데이터베이스 연결에 실패했습니다. 페이지를 새로고침해주세요.', 'error');
                return;
            }
            
            console.log('Supabase 연결 성공, 테스트 데이터:', data);
        } catch (error) {
            console.error('Supabase 연결 테스트 중 오류:', error);
            this.showNotification('데이터베이스 연결 중 오류가 발생했습니다.', 'error');
            return;
        }
        
        await this.loadRoutines();
        await this.loadRoutineCompletions();
        await this.loadMemo();
        this.renderRoutines();
        this.updateStats();
        this.renderMemo();
        this.bindEvents();
        this.updateAutoSaveButton(this.autoSaveEnabled);
        this.lastSavedData = JSON.stringify(this.routines);
        
        // 알림 초기화
        this.initNotifications();
        
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

    async addRoutine() {
        const name = document.getElementById('routine-name').value.trim();
        const time = document.getElementById('routine-time').value;
        const category = document.getElementById('routine-category').value;

        if (!name || !time) {
            alert('루틴 이름과 시간을 모두 입력해주세요.');
            return;
        }

        try {
            const { data, error } = await this.supabase
                .from('routines')
                .insert([
                    {
            name,
            time,
            category,
                        completed: false
                    }
                ])
                .select();

            if (error) {
                console.error('루틴 추가 중 오류:', error);
                this.showNotification('루틴 추가 중 오류가 발생했습니다.', 'error');
                return;
            }

            // 로컬 배열에 추가
            this.routines.push(data[0]);
        this.renderRoutines();
        this.updateStats();
        this.resetForm();
            this.showNotification('루틴이 성공적으로 추가되었습니다!', 'success');
        } catch (error) {
            console.error('루틴 추가 중 오류:', error);
            this.showNotification('루틴 추가 중 오류가 발생했습니다.', 'error');
        }
    }

    resetForm() {
        document.getElementById('routine-form').reset();
    }

    async toggleComplete(routineId) {
        const routine = this.routines.find(r => r.id === routineId);
        if (!routine) return;

        const isCurrentlyCompleted = routine.completed;
        const today = this.getKoreanDateString(); // 한국 시간 기준 YYYY-MM-DD 형식

        try {
            if (!isCurrentlyCompleted) {
                // 루틴 완료 처리
                // 1. routines 테이블의 completed 필드 업데이트
                const { error: routineError } = await this.supabase
                    .from('routines')
                    .update({ completed: true })
                    .eq('id', routineId);

                if (routineError) {
                    console.error('루틴 상태 변경 중 오류:', routineError);
                    this.showNotification('루틴 상태 변경 중 오류가 발생했습니다.', 'error');
                    return;
                }

                // 2. routine_completions 테이블에 완료 이력 추가
                const { error: completionError } = await this.supabase
                    .from('routine_completions')
                    .insert({
                        routine_id: routineId,
                        completion_date: today,
                        completed_at: this.getKoreanTimeString(),
                        notes: null
                    });

                if (completionError) {
                    console.error('완료 이력 저장 중 오류:', completionError);
                    // 이력 저장 실패해도 루틴 완료는 유지
                }

                // 로컬 상태 업데이트
                routine.completed = true;
                this.routineCompletions.set(routineId, today);
                
                this.showNotification('루틴이 완료되었습니다!', 'success');
            } else {
                // 루틴 완료 취소 처리
                // 1. routines 테이블의 completed 필드 업데이트
                const { error: routineError } = await this.supabase
                    .from('routines')
                    .update({ completed: false })
                    .eq('id', routineId);

                if (routineError) {
                    console.error('루틴 상태 변경 중 오류:', routineError);
                    this.showNotification('루틴 상태 변경 중 오류가 발생했습니다.', 'error');
                    return;
                }

                // 2. 오늘 날짜의 완료 이력 삭제
                const { error: completionError } = await this.supabase
                    .from('routine_completions')
                    .delete()
                    .eq('routine_id', routineId)
                    .eq('completion_date', today);

                if (completionError) {
                    console.error('완료 이력 삭제 중 오류:', completionError);
                    // 이력 삭제 실패해도 루틴 완료 취소는 유지
                }

                // 로컬 상태 업데이트
                routine.completed = false;
                this.routineCompletions.delete(routineId);
                
                this.showNotification('완료가 취소되었습니다.', 'warning');
            }

            this.renderRoutines();
            this.updateStats();
        } catch (error) {
            console.error('루틴 상태 변경 중 오류:', error);
            this.showNotification('루틴 상태 변경 중 오류가 발생했습니다.', 'error');
        }
    }

    async deleteRoutine(routineId) {
        if (confirm('정말로 이 루틴을 삭제하시겠습니까?')) {
            try {
                const { error } = await this.supabase
                    .from('routines')
                    .delete()
                    .eq('id', routineId);

                if (error) {
                    console.error('루틴 삭제 중 오류:', error);
                    this.showNotification('루틴 삭제 중 오류가 발생했습니다.', 'error');
                    return;
                }

            this.routines = this.routines.filter(r => r.id !== routineId);
            this.renderRoutines();
            this.updateStats();
                this.showNotification('루틴이 성공적으로 삭제되었습니다!', 'success');
            } catch (error) {
                console.error('루틴 삭제 중 오류:', error);
                this.showNotification('루틴 삭제 중 오류가 발생했습니다.', 'error');
            }
        }
    }

    async editRoutine(routineId) {
        const routine = this.routines.find(r => r.id === routineId);
        if (!routine) return;

        const newName = prompt('새로운 루틴 이름을 입력하세요:', routine.name);
        if (newName && newName.trim() !== '') {
            try {
                const { error } = await this.supabase
                    .from('routines')
                    .update({ name: newName.trim() })
                    .eq('id', routineId);

                if (error) {
                    console.error('루틴 수정 중 오류:', error);
                    this.showNotification('루틴 수정 중 오류가 발생했습니다.', 'error');
                    return;
                }

            routine.name = newName.trim();
            this.renderRoutines();
                this.showNotification('루틴이 성공적으로 수정되었습니다!', 'success');
            } catch (error) {
                console.error('루틴 수정 중 오류:', error);
                this.showNotification('루틴 수정 중 오류가 발생했습니다.', 'error');
            }
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

        const isCompleted = routine.completed;

        return `
            <div class="routine-card ${isCompleted ? 'completed' : ''}">
                <div class="routine-header">
                    <div class="routine-name">${routine.name}</div>
                    <div class="routine-category">
                        ${categoryEmojis[routine.category]} ${categoryNames[routine.category]}
                    </div>
                    <div class="routine-time">${routine.time}</div>
                </div>
                <div class="routine-actions">
                    <button class="btn btn-complete" onclick="routineManager.toggleComplete(${routine.id})">
                        ${isCompleted ? '완료 취소' : '완료'}
                    </button>
                    <button class="btn btn-edit" onclick="routineManager.editRoutine(${routine.id})">
                        수정
                    </button>
                    <button class="btn btn-delete" onclick="routineManager.deleteRoutine(${routine.id})">
                        삭제
                    </button>
                    <button class="btn btn-history" onclick="routineManager.showRoutineHistory(${routine.id})">
                        📊 개별 이력
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

    async loadRoutines() {
        try {
            console.log('루틴 로드 시작...');
            const { data, error } = await this.supabase
                .from('routines')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) {
                console.error('루틴 로드 중 오류:', error);
                console.error('오류 상세 정보:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code
                });
                this.showNotification(`루틴 로드 중 오류: ${error.message}`, 'error');
            return;
        }

            console.log('루틴 로드 성공:', data);
            this.routines = data || [];
        } catch (error) {
            console.error('루틴 로드 중 예외:', error);
            this.showNotification(`루틴 로드 중 예외: ${error.message}`, 'error');
        }
    }

    async loadRoutineCompletions() {
        try {
            // 오늘 날짜의 완료 이력을 로드
            console.log('루틴 완료 상태 로드 시작');
            const today = this.getKoreanDateString();
            
            // routine_completions 테이블에서 오늘 날짜의 완료 이력 조회
            const { data, error } = await this.supabase
                .from('routine_completions')
                .select('routine_id')
                .eq('completion_date', today);

            if (error) {
                console.error('완료 이력 로드 중 오류:', error);
                // 오류가 발생해도 routines 테이블의 completed 상태를 사용
                this.loadRoutineCompletionsFromRoutines();
                return;
            }

            // 완료 상태를 Map에 저장
            this.routineCompletions.clear();
            const completedRoutineIds = new Set(data.map(item => item.routine_id));
            
            // routines 테이블의 completed 상태도 업데이트
            this.routines.forEach(routine => {
                const isCompleted = completedRoutineIds.has(routine.id);
                routine.completed = isCompleted;
                
                if (isCompleted) {
                    this.routineCompletions.set(routine.id, today);
                }
            });

            console.log('루틴 완료 상태 로드 성공:', this.routineCompletions);
        } catch (error) {
            console.error('루틴 완료 상태 로드 중 예외:', error);
            // 예외가 발생하면 routines 테이블의 completed 상태를 사용
            this.loadRoutineCompletionsFromRoutines();
        }
    }

    // routines 테이블에서 완료 상태 로드 (fallback)
    loadRoutineCompletionsFromRoutines() {
        this.routineCompletions.clear();
        const today = this.getKoreanDateString();
        
        this.routines.forEach(routine => {
            if (routine.completed) {
                this.routineCompletions.set(routine.id, today);
            }
        });
    }

    // JSON 파일로 내보내기
    exportToFile() {
        try {
            const data = {
                routines: this.routines,
                lastSaved: new Date().toISOString(),
                version: '2.0',
                source: 'supabase'
            };

            const jsonString = JSON.stringify(data, null, 2);

    // 다운로드 방식으로 저장
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
            
            this.showNotification('파일이 성공적으로 내보내졌습니다!', 'success');
        } catch (error) {
            console.error('파일 내보내기 중 오류 발생:', error);
            this.showNotification('파일 내보내기 중 오류가 발생했습니다.', 'error');
        }
    }

    // JSON 파일에서 가져오기
    async importFromFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.routines || !Array.isArray(data.routines)) {
                this.showNotification('올바르지 않은 파일 형식입니다.', 'error');
                return;
            }

            // 기존 루틴 삭제
            const { error: deleteError } = await this.supabase
                .from('routines')
                .delete()
                .neq('id', 0);

            if (deleteError) {
                console.error('기존 루틴 삭제 중 오류:', deleteError);
                this.showNotification('기존 루틴 삭제 중 오류가 발생했습니다.', 'error');
                return;
            }

            // 새 루틴들 추가
            const routinesToInsert = data.routines.map(routine => ({
                name: routine.name,
                time: routine.time,
                category: routine.category,
                completed: routine.completed || false
            }));

            const { data: insertedData, error: insertError } = await this.supabase
                .from('routines')
                .insert(routinesToInsert)
                .select();

            if (insertError) {
                console.error('루틴 가져오기 중 오류:', insertError);
                this.showNotification('루틴 가져오기 중 오류가 발생했습니다.', 'error');
                return;
            }

            this.routines = insertedData || [];
            this.renderRoutines();
            this.updateStats();
            this.showNotification('파일이 성공적으로 가져와졌습니다!', 'success');

        } catch (error) {
            console.error('파일 가져오기 중 오류 발생:', error);
            this.showNotification('파일 가져오기 중 오류가 발생했습니다.', 'error');
        }

        // 파일 입력 초기화
        event.target.value = '';
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

    // 수동 저장 (사용자가 직접 저장 버튼 클릭)
    manualSave() {
        this.showNotification('Supabase에 실시간으로 저장되고 있습니다!', 'info');
    }

    // 메모 로드
    async loadMemo() {
        try {
            const today = this.getKoreanDateString(); // 한국 시간 기준 YYYY-MM-DD 형식
            
            const { data, error } = await this.supabase
                .from('daily_memos')
                .select('memo')
                .eq('date', today)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116은 데이터가 없을 때의 에러
                console.error('메모 로드 중 오류:', error);
                return;
            }

            this.memo = data?.memo || '';
        } catch (error) {
            console.error('메모 로드 중 오류:', error);
        }
    }

    // 메모 저장
    async saveMemo() {
        const memoTextarea = document.getElementById('daily-memo');
        if (!memoTextarea) return;

            this.memo = memoTextarea.value;
        const today = this.getKoreanDateString(); // 한국 시간 기준 YYYY-MM-DD 형식

        try {
            const { error } = await this.supabase
                .from('daily_memos')
                .upsert({
                    date: today,
                    memo: this.memo
                }, {
                    onConflict: 'date'
                });

            if (error) {
                console.error('메모 저장 중 오류:', error);
                this.showNotification('메모 저장 중 오류가 발생했습니다.', 'error');
                return;
            }

            this.showNotification('메모가 저장되었습니다!', 'success');
        } catch (error) {
            console.error('메모 저장 중 오류:', error);
            this.showNotification('메모 저장 중 오류가 발생했습니다.', 'error');
        }
    }

    // 메모 지우기
    async clearMemo() {
        if (confirm('메모를 지우시겠습니까?')) {
            const memoTextarea = document.getElementById('daily-memo');
            if (!memoTextarea) return;

            const today = this.getKoreanDateString(); // 한국 시간 기준 YYYY-MM-DD 형식

            try {
                const { error } = await this.supabase
                    .from('daily_memos')
                    .delete()
                    .eq('date', today);

                if (error) {
                    console.error('메모 삭제 중 오류:', error);
                    this.showNotification('메모 삭제 중 오류가 발생했습니다.', 'error');
                    return;
                }

                memoTextarea.value = '';
                this.memo = '';
                this.showNotification('메모가 지워졌습니다!', 'warning');
            } catch (error) {
                console.error('메모 삭제 중 오류:', error);
                this.showNotification('메모 삭제 중 오류가 발생했습니다.', 'error');
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
    async autoSaveMemo() {
        const memoTextarea = document.getElementById('daily-memo');
        if (!memoTextarea) return;

            this.memo = memoTextarea.value;
        const today = this.getKoreanDateString(); // 한국 시간 기준 YYYY-MM-DD 형식

        try {
            await this.supabase
                .from('daily_memos')
                .upsert({
                    date: today,
                    memo: this.memo
                }, {
                    onConflict: 'date'
                });
        } catch (error) {
            console.error('메모 자동 저장 중 오류:', error);
        }
    }

    // 과거 메모 보기
    async showMemoHistory() {
        try {
            // 최근 30일간의 메모 조회
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const startDate = this.getKoreanDateString(thirtyDaysAgo);

            const { data, error } = await this.supabase
                .from('daily_memos')
                .select('date, memo')
                .gte('date', startDate)
                .order('date', { ascending: false });

            if (error) {
                console.error('메모 이력 조회 중 오류:', error);
                this.showNotification('메모 이력 조회 중 오류가 발생했습니다.', 'error');
                return;
            }

            // 메모 이력 모달 표시
            this.showMemoHistoryModal(data || []);
        } catch (error) {
            console.error('메모 이력 조회 중 예외:', error);
            this.showNotification('메모 이력 조회 중 오류가 발생했습니다.', 'error');
        }
    }

    // 메모 이력 모달 표시
    showMemoHistoryModal(memoData) {
        // 기존 모달이 있다면 제거
        const existingModal = document.querySelector('.memo-history-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // 모달 생성
        const modal = document.createElement('div');
        modal.className = 'memo-history-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 15px;
            padding: 30px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        `;

        // 메모 데이터가 있는지 확인
        const hasMemos = memoData.length > 0;

        if (!hasMemos) {
            modalContent.innerHTML = `
                <h2 style="margin-bottom: 20px; color: #333;">📚 과거 메모</h2>
                <div style="text-align: center; padding: 40px; color: #666;">
                    최근 30일간 저장된 메모가 없습니다.
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <button onclick="this.closest('.memo-history-modal').remove()" 
                            style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
                        닫기
                    </button>
                </div>
            `;
        } else {
            // 메모 목록 HTML 생성
            const memoHTML = memoData.map(item => {
                const dateObj = new Date(item.date);
                const dayName = dateObj.toLocaleDateString('ko-KR', { weekday: 'short' });
                const formattedDate = dateObj.toLocaleDateString('ko-KR');
                const memoText = item.memo ? item.memo.replace(/\n/g, '<br>') : '(메모 없음)';
                
                return `
                    <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 15px; background: #f8fafc;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <strong style="color: #667eea; font-size: 1.1rem;">${formattedDate}</strong>
                            <span style="background: #e2e8f0; color: #4a5568; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem;">${dayName}</span>
                        </div>
                        <div style="color: #4a5568; line-height: 1.6; white-space: pre-wrap;">${memoText}</div>
                    </div>
                `;
            }).join('');

            modalContent.innerHTML = `
                <h2 style="margin-bottom: 20px; color: #333;">📚 과거 메모</h2>
                <div style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 10px;">
                    <strong>총 ${memoData.length}개의 메모가 있습니다.</strong>
                </div>
                <div style="max-height: 400px; overflow-y: auto;">
                    ${memoHTML}
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <button onclick="this.closest('.memo-history-modal').remove()" 
                            style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
                        닫기
                    </button>
                </div>
            `;
        }

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // 루틴 이력 조회
    async showRoutineHistory(routineId) {
        const routine = this.routines.find(r => r.id === routineId);
        if (!routine) return;

        try {
            // 최근 30일간의 완료 이력 조회
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const startDate = this.getKoreanDateString(thirtyDaysAgo);

            const { data, error } = await this.supabase
                .from('routine_completions')
                .select('completion_date, completed_at, notes')
                .eq('routine_id', routineId)
                .gte('completion_date', startDate)
                .order('completion_date', { ascending: false });

            if (error) {
                console.error('루틴 이력 조회 중 오류:', error);
                this.showNotification('루틴 이력 조회 중 오류가 발생했습니다.', 'error');
                return;
            }

            // 이력 모달 표시
            this.showHistoryModal(routine.name, data || []);
        } catch (error) {
            console.error('루틴 이력 조회 중 예외:', error);
            this.showNotification('루틴 이력 조회 중 오류가 발생했습니다.', 'error');
        }
    }

    // 일자별 전체 루틴 이력 조회
    async showDailyHistory() {
        try {
            // 최근 30일간의 모든 루틴 완료 이력 조회
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const startDate = this.getKoreanDateString(thirtyDaysAgo);

            const { data, error } = await this.supabase
                .from('routine_completions')
                .select(`
                    completion_date,
                    completed_at,
                    notes,
                    routines!inner(name, category, time)
                `)
                .gte('completion_date', startDate)
                .order('completion_date', { ascending: false });

            if (error) {
                console.error('일자별 이력 조회 중 오류:', error);
                this.showNotification('일자별 이력 조회 중 오류가 발생했습니다.', 'error');
                return;
            }

            // 일자별로 그룹화
            const groupedData = this.groupHistoryByDate(data || []);
            this.showDailyHistoryModal(groupedData);
        } catch (error) {
            console.error('일자별 이력 조회 중 예외:', error);
            this.showNotification('일자별 이력 조회 중 오류가 발생했습니다.', 'error');
        }
    }

    // 이력을 날짜별로 그룹화
    groupHistoryByDate(historyData) {
        const grouped = {};
        
        historyData.forEach(item => {
            const date = item.completion_date;
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(item);
        });

        // 날짜별로 정렬
        return Object.keys(grouped)
            .sort((a, b) => new Date(b) - new Date(a))
            .reduce((result, date) => {
                result[date] = grouped[date];
                return result;
            }, {});
    }

    // 이력 모달 표시
    showHistoryModal(routineName, historyData) {
        // 기존 모달이 있다면 제거
        const existingModal = document.querySelector('.history-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // 모달 생성
        const modal = document.createElement('div');
        modal.className = 'history-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 15px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        `;

        const historyHTML = historyData.length > 0 
            ? historyData.map(item => `
                <div style="padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${new Date(item.completion_date).toLocaleDateString('ko-KR')}</strong>
                        ${item.notes ? `<br><small style="color: #666;">${item.notes}</small>` : ''}
                    </div>
                    <small style="color: #999;">${this.formatKoreanTime(item.completed_at)}</small>
                </div>
            `).join('')
            : '<div style="text-align: center; padding: 20px; color: #666;">최근 30일간 완료 기록이 없습니다.</div>';

        modalContent.innerHTML = `
            <h2 style="margin-bottom: 20px; color: #333;">📊 ${routineName} 완료 이력</h2>
            <div style="margin-bottom: 20px;">
                <strong>총 완료 횟수:</strong> ${historyData.length}회
            </div>
            <div style="max-height: 300px; overflow-y: auto;">
                ${historyHTML}
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="this.closest('.history-modal').remove()" 
                        style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
                    닫기
                </button>
            </div>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // 일자별 이력 모달 표시
    showDailyHistoryModal(groupedData) {
        // 기존 모달이 있다면 제거
        const existingModal = document.querySelector('.daily-history-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // 모달 생성
        const modal = document.createElement('div');
        modal.className = 'daily-history-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 15px;
            padding: 30px;
            max-width: 700px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        `;

        // 통계 계산
        const totalDays = Object.keys(groupedData).length;
        const totalCompletions = Object.values(groupedData).reduce((sum, dayData) => sum + dayData.length, 0);
        const averagePerDay = totalDays > 0 ? (totalCompletions / totalDays).toFixed(1) : 0;

        // 일자별 이력 HTML 생성
        const historyHTML = Object.entries(groupedData)
            .map(([date, dayData]) => {
                const dateObj = new Date(date);
                const dayName = dateObj.toLocaleDateString('ko-KR', { weekday: 'short' });
                const formattedDate = dateObj.toLocaleDateString('ko-KR');
                
                const routinesHTML = dayData
                    .sort((a, b) => a.routines.time.localeCompare(b.routines.time))
                    .map(item => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8fafc; border-radius: 6px; margin-bottom: 4px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="background: #667eea; color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.7rem;">${item.routines.time}</span>
                                <span style="font-weight: 500;">${item.routines.name}</span>
                                <span style="background: #e2e8f0; color: #4a5568; padding: 2px 6px; border-radius: 8px; font-size: 0.7rem;">${this.getCategoryName(item.routines.category)}</span>
                            </div>
                            <small style="color: #999;">${this.formatKoreanTime(item.completed_at)}</small>
                        </div>
                    `).join('');

                return `
                    <div style="margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                        <div style="background: #667eea; color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>${formattedDate}</strong>
                                <span style="margin-left: 8px; opacity: 0.8;">${dayName}</span>
                            </div>
                            <span style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 12px; font-size: 0.8rem;">
                                ${dayData.length}개 완료
                            </span>
                        </div>
                        <div style="padding: 12px;">
                            ${routinesHTML}
                        </div>
                    </div>
                `;
            }).join('');

        modalContent.innerHTML = `
            <h2 style="margin-bottom: 20px; color: #333;">📅 일자별 루틴 이력</h2>
            <div style="margin-bottom: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 10px;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #667eea;">${totalDays}</div>
                    <div style="font-size: 0.9rem; color: #666;">활동한 날</div>
                </div>
                <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 10px;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #48bb78;">${totalCompletions}</div>
                    <div style="font-size: 0.9rem; color: #666;">총 완료 횟수</div>
                </div>
                <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 10px;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #ed8936;">${averagePerDay}</div>
                    <div style="font-size: 0.9rem; color: #666;">일평균 완료</div>
                </div>
            </div>
            <div style="max-height: 400px; overflow-y: auto;">
                ${historyHTML || '<div style="text-align: center; padding: 40px; color: #666;">최근 30일간 완료 기록이 없습니다.</div>'}
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="this.closest('.daily-history-modal').remove()" 
                        style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
                    닫기
                </button>
            </div>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // 카테고리 이름 반환
    getCategoryName(category) {
        const categoryNames = {
            morning: '아침',
            work: '업무',
            exercise: '운동',
            study: '공부',
            evening: '저녁',
            other: '기타'
        };
        return categoryNames[category] || category;
    }

    // 한국 시간 문자열 반환 (ISO 형식)
    getKoreanTimeString() {
        const now = new Date();
        // 한국 시간으로 변환 (UTC+9)
        const koreanTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        return koreanTime.toISOString();
    }

    // 한국 시간으로 포맷된 날짜 문자열 반환 (YYYY-MM-DD)
    getKoreanDateString(date = null) {
        const targetDate = date || new Date();
        // 한국 시간으로 변환 (UTC+9)
        const koreanTime = new Date(targetDate.getTime() + (9 * 60 * 60 * 1000));
        return koreanTime.toISOString().split('T')[0];
    }

    // 한국 시간으로 포맷된 시간 문자열 반환 (HH:MM)
    formatKoreanTime(isoString) {
        const date = new Date(isoString);
        // 한국 시간으로 변환 (UTC+9)
        const koreanTime = new Date(date.getTime() + (9 * 60 * 60 * 1000));
        return koreanTime.toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Asia/Seoul'
        });
    }

    // 주간 통계 조회
    async showWeeklyStats() {
        try {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            const startDate = this.getKoreanDateString(oneWeekAgo);
            const endDate = this.getKoreanDateString();

            const { data, error } = await this.supabase
                .from('routine_completions')
                .select(`
                    completion_date,
                    routine_id,
                    routines!inner(name, category)
                `)
                .gte('completion_date', startDate)
                .lte('completion_date', endDate)
                .order('completion_date', { ascending: false });

            if (error) {
                console.error('주간 통계 조회 중 오류:', error);
                this.showNotification('주간 통계 조회 중 오류가 발생했습니다.', 'error');
                return;
            }

            this.showStatsModal('주간 통계', data || [], startDate, endDate);
        } catch (error) {
            console.error('주간 통계 조회 중 예외:', error);
            this.showNotification('주간 통계 조회 중 오류가 발생했습니다.', 'error');
        }
    }

    // 월간 통계 조회
    async showMonthlyStats() {
        try {
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            const startDate = this.getKoreanDateString(oneMonthAgo);
            const endDate = this.getKoreanDateString();

            const { data, error } = await this.supabase
                .from('routine_completions')
                .select(`
                    completion_date,
                    routine_id,
                    routines!inner(name, category)
                `)
                .gte('completion_date', startDate)
                .lte('completion_date', endDate)
                .order('completion_date', { ascending: false });

            if (error) {
                console.error('월간 통계 조회 중 오류:', error);
                this.showNotification('월간 통계 조회 중 오류가 발생했습니다.', 'error');
                return;
            }

            this.showStatsModal('월간 통계', data || [], startDate, endDate);
        } catch (error) {
            console.error('월간 통계 조회 중 예외:', error);
            this.showNotification('월간 통계 조회 중 오류가 발생했습니다.', 'error');
        }
    }

    // 통계 모달 표시
    showStatsModal(title, statsData, startDate, endDate) {
        // 기존 모달이 있다면 제거
        const existingModal = document.querySelector('.stats-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // 모달 생성
        const modal = document.createElement('div');
        modal.className = 'stats-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 15px;
            padding: 30px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        `;

        // 통계 계산
        const totalCompletions = statsData.length;
        const uniqueDays = new Set(statsData.map(item => item.completion_date)).size;
        const routineStats = {};
        
        statsData.forEach(item => {
            const routineName = item.routines.name;
            if (!routineStats[routineName]) {
                routineStats[routineName] = 0;
            }
            routineStats[routineName]++;
        });

        const statsHTML = Object.entries(routineStats)
            .sort(([,a], [,b]) => b - a)
            .map(([routineName, count]) => `
                <div style="padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                    <span><strong>${routineName}</strong></span>
                    <span style="background: #667eea; color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem;">${count}회</span>
                </div>
            `).join('');

        modalContent.innerHTML = `
            <h2 style="margin-bottom: 20px; color: #333;">📊 ${title}</h2>
            <div style="margin-bottom: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 10px;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #667eea;">${totalCompletions}</div>
                    <div style="font-size: 0.9rem; color: #666;">총 완료 횟수</div>
                </div>
                <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 10px;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #48bb78;">${uniqueDays}</div>
                    <div style="font-size: 0.9rem; color: #666;">활동한 날</div>
                </div>
                <div style="text-align: center; padding: 15px; background: #f8fafc; border-radius: 10px;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #ed8936;">${Object.keys(routineStats).length}</div>
                    <div style="font-size: 0.9rem; color: #666;">활성 루틴</div>
                </div>
            </div>
            <div style="margin-bottom: 20px;">
                <strong>기간:</strong> ${new Date(startDate).toLocaleDateString('ko-KR')} ~ ${new Date(endDate).toLocaleDateString('ko-KR')}
            </div>
            <div style="margin-bottom: 20px;">
                <h3 style="margin-bottom: 10px;">루틴별 완료 횟수</h3>
                <div style="max-height: 200px; overflow-y: auto;">
                    ${statsHTML || '<div style="text-align: center; padding: 20px; color: #666;">완료 기록이 없습니다.</div>'}
                </div>
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="this.closest('.stats-modal').remove()" 
                        style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
                    닫기
                </button>
            </div>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // 알림 초기화
    initNotifications() {
        // 알림 권한 상태 확인
        this.checkNotificationPermission();
        
        // 로컬 스토리지에서 알림 설정 로드
        this.loadNotificationSettings();
        
        // 알림 체크 시작
        this.startNotificationCheck();
        
        console.log('알림 시스템 초기화 완료');
    }

    // 알림 권한 상태 확인
    checkNotificationPermission() {
        // iOS Safari 감지
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        
        if (isIOS && isSafari) {
            // iOS Safari의 경우 특별 처리
            this.updateNotificationStatus('ios-safari');
            return;
        }
        
        if ('Notification' in window) {
            this.notificationPermission = Notification.permission;
            this.updateNotificationStatus();
        } else {
            this.updateNotificationStatus('not-supported');
        }
    }

    // 알림 권한 요청
    async requestNotificationPermission() {
        // iOS Safari 감지
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        
        if (isIOS && isSafari) {
            this.showIOSNotificationGuide();
            return;
        }
        
        if (!('Notification' in window)) {
            this.showNotification('이 브라우저는 알림을 지원하지 않습니다.', 'error');
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            this.notificationPermission = permission;
            this.updateNotificationStatus();
            
            if (permission === 'granted') {
                this.showNotification('알림 권한이 허용되었습니다!', 'success');
            } else if (permission === 'denied') {
                this.showNotification('알림 권한이 거부되었습니다. 브라우저 설정에서 수동으로 허용해주세요.', 'warning');
            }
        } catch (error) {
            console.error('알림 권한 요청 중 오류:', error);
            this.showNotification('알림 권한 요청 중 오류가 발생했습니다.', 'error');
        }
    }

    // 알림 설정 토글
    toggleNotifications() {
        const checkbox = document.getElementById('notification-enabled');
        this.notificationsEnabled = checkbox.checked;
        
        // 로컬 스토리지에 저장
        localStorage.setItem('notifications-enabled', this.notificationsEnabled);
        
        if (this.notificationsEnabled) {
            this.startNotificationCheck();
            this.showNotification('미완료 루틴 알림이 활성화되었습니다. (오전 11시, 오후 1시 30분)', 'success');
        } else {
            this.stopNotificationCheck();
            this.showNotification('미완료 루틴 알림이 비활성화되었습니다.', 'warning');
        }
    }

    // 알림 설정 로드
    loadNotificationSettings() {
        const saved = localStorage.getItem('notifications-enabled');
        this.notificationsEnabled = saved === 'true';
        
        const checkbox = document.getElementById('notification-enabled');
        if (checkbox) {
            checkbox.checked = this.notificationsEnabled;
        }
    }

    // 알림 상태 업데이트
    updateNotificationStatus(status = null) {
        const statusElement = document.getElementById('notification-status');
        if (!statusElement) return;

        const currentStatus = status || this.notificationPermission;
        
        switch (currentStatus) {
            case 'granted':
                statusElement.textContent = '알림 상태: 허용됨 ✅';
                statusElement.style.color = '#48bb78';
                break;
            case 'denied':
                statusElement.textContent = '알림 상태: 거부됨 ❌';
                statusElement.style.color = '#f56565';
                break;
            case 'default':
                statusElement.textContent = '알림 상태: 권한 요청 필요 ⚠️';
                statusElement.style.color = '#ed8936';
                break;
            case 'not-supported':
                statusElement.textContent = '알림 상태: 지원되지 않음 ❌';
                statusElement.style.color = '#f56565';
                break;
            case 'ios-safari':
                statusElement.textContent = '알림 상태: iOS Safari 감지됨 📱';
                statusElement.style.color = '#4299e1';
                break;
            default:
                statusElement.textContent = '알림 상태: 확인 중...';
                statusElement.style.color = '#718096';
        }
    }

    // 알림 체크 시작
    startNotificationCheck() {
        // iOS Safari 감지
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        
        if (!this.notificationsEnabled) {
            return;
        }
        
        // iOS Safari에서는 권한 상태와 관계없이 체크 (PWA 설치 후 작동)
        if (isIOS && isSafari) {
            if (!this.notificationsEnabled) {
                return;
            }
        } else {
            if (this.notificationPermission !== 'granted') {
                return;
            }
        }

        // 기존 체크 중지
        this.stopNotificationCheck();

        // 매분마다 체크
        this.notificationCheckInterval = setInterval(() => {
            this.checkForIncompleteRoutines();
        }, 60000); // 1분마다 체크

        console.log('알림 체크 시작됨');
    }

    // 알림 체크 중지
    stopNotificationCheck() {
        if (this.notificationCheckInterval) {
            clearInterval(this.notificationCheckInterval);
            this.notificationCheckInterval = null;
            console.log('알림 체크 중지됨');
        }
    }

    // 미완료 루틴 체크
    checkForIncompleteRoutines() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = currentHour * 60 + currentMinute;
        const today = now.toDateString();

        // 각 알림 시간 확인
        for (const notificationTime of this.notificationTimes) {
            const targetTime = notificationTime.hour * 60 + notificationTime.minute;
            
            // 해당 시간이 지났는지 확인
            if (currentTime >= targetTime) {
                const notificationKey = `${today}-${notificationTime.hour}-${notificationTime.minute}`;
                
                // 오늘 해당 시간에 이미 알림을 보냈는지 확인
                if (this.sentNotifications.has(notificationKey)) {
                    continue;
                }

                // 미완료 루틴 확인
                const incompleteRoutines = this.routines.filter(routine => !routine.completed);
                
                if (incompleteRoutines.length > 0) {
                    this.sendIncompleteRoutineNotification(incompleteRoutines, notificationTime.label);
                    this.sentNotifications.add(notificationKey);
                    console.log(`${notificationTime.label} 알림 전송됨`);
                }
            }
        }
    }

    // 미완료 루틴 알림 전송
    sendIncompleteRoutineNotification(incompleteRoutines, timeLabel = '') {
        // iOS Safari 감지
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        
        const routineNames = incompleteRoutines.map(r => r.name).join(', ');
        const timePrefix = timeLabel ? `[${timeLabel}] ` : '';
        const message = `${timePrefix}아직 완료하지 않은 루틴이 ${incompleteRoutines.length}개 있습니다: ${routineNames}`;

        // iOS Safari에서는 다른 방식으로 알림 처리
        if (isIOS && isSafari) {
            // iOS에서는 브라우저 알림 대신 페이지 내 알림 사용
            this.showNotification(`⏰ ${message}`, 'warning');
            
            // 진동 (iOS에서 지원되는 경우)
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200, 100, 200]);
            }
            
            console.log('iOS Safari 미완료 루틴 알림:', message);
            return;
        }

        // 일반 브라우저에서의 알림
        if (this.notificationPermission !== 'granted') {
            // 권한이 없어도 페이지 내 알림은 표시
            this.showNotification(`⏰ ${message}`, 'warning');
            return;
        }

        // 브라우저 알림
        const notification = new Notification(`⏰ 루틴 알림 ${timeLabel}`, {
            body: message,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: `routine-reminder-${timeLabel}`,
            requireInteraction: true,
            silent: false
        });

        // 진동 (모바일에서 지원되는 경우)
        if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200, 100, 200]);
        }

        // 알림 클릭 시 페이지 포커스
        notification.onclick = () => {
            window.focus();
            notification.close();
        };

        // 5초 후 자동 닫기
        setTimeout(() => {
            notification.close();
        }, 5000);

        console.log('미완료 루틴 알림 전송:', message);
    }

    // 알림 테스트
    testNotification() {
        // iOS Safari 감지
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        
        if (isIOS && isSafari) {
            // iOS Safari에서는 바로 테스트 실행
            const testRoutines = this.routines.filter(r => !r.completed);
            
            if (testRoutines.length === 0) {
                const testRoutine = {
                    id: 'test',
                    name: '테스트 루틴',
                    completed: false
                };
                this.sendIncompleteRoutineNotification([testRoutine]);
            } else {
                this.sendIncompleteRoutineNotification(testRoutines);
            }
            
            this.showNotification('iOS Safari 테스트 알림을 전송했습니다!', 'success');
            return;
        }
        
        if (this.notificationPermission !== 'granted') {
            this.showNotification('먼저 알림 권한을 허용해주세요.', 'warning');
            return;
        }

        // 테스트용 미완료 루틴 생성
        const testRoutines = this.routines.filter(r => !r.completed);
        
        if (testRoutines.length === 0) {
            // 모든 루틴이 완료된 경우 테스트용 루틴 생성
            const testRoutine = {
                id: 'test',
                name: '테스트 루틴',
                completed: false
            };
            this.sendIncompleteRoutineNotification([testRoutine]);
        } else {
            this.sendIncompleteRoutineNotification(testRoutines);
        }

        this.showNotification('테스트 알림을 전송했습니다!', 'success');
    }

    // iOS Safari 알림 설정 가이드 표시
    showIOSNotificationGuide() {
        // 기존 모달이 있다면 제거
        const existingModal = document.querySelector('.ios-guide-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // 모달 생성
        const modal = document.createElement('div');
        modal.className = 'ios-guide-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 15px;
            padding: 30px;
            max-width: 400px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        `;

        modalContent.innerHTML = `
            <h2 style="margin-bottom: 20px; color: #333;">📱 iOS Safari 알림 설정</h2>
            <div style="margin-bottom: 20px;">
                <p style="color: #4a5568; line-height: 1.6; margin-bottom: 15px;">
                    iOS Safari에서는 알림 권한을 수동으로 설정해야 합니다.<br>
                    <strong>오전 11시와 오후 1시 30분</strong>에 미완료 루틴 알림을 받을 수 있습니다.
                </p>
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #4299e1;">
                    <h3 style="margin: 0 0 10px 0; color: #2d3748;">설정 방법:</h3>
                    <ol style="margin: 0; padding-left: 20px; color: #4a5568;">
                        <li style="margin-bottom: 8px;">Safari 하단의 <strong>공유</strong> 버튼(⬆️) 탭</li>
                        <li style="margin-bottom: 8px;"><strong>"홈 화면에 추가"</strong> 선택</li>
                        <li style="margin-bottom: 8px;">홈 화면에 추가된 앱 아이콘 탭</li>
                        <li style="margin-bottom: 8px;">앱에서 알림 권한 요청 시 <strong>"허용"</strong> 선택</li>
                    </ol>
                </div>
                <p style="color: #718096; font-size: 0.9rem; margin-top: 15px;">
                    또는 <strong>설정 > Safari > 알림</strong>에서 이 사이트의 알림을 허용할 수 있습니다.
                </p>
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="this.closest('.ios-guide-modal').remove()" 
                        style="background: #4299e1; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; margin-right: 10px;">
                    확인
                </button>
                <button onclick="routineManager.tryIOSNotification()" 
                        style="background: #48bb78; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
                    다시 시도
                </button>
            </div>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // iOS에서 알림 재시도
    tryIOSNotification() {
        // 모달 닫기
        const modal = document.querySelector('.ios-guide-modal');
        if (modal) {
            modal.remove();
        }

        // iOS에서도 Notification API가 작동할 수 있으므로 시도
        if ('Notification' in window) {
            this.requestNotificationPermission();
        } else {
            this.showNotification('iOS Safari에서는 PWA로 설치해야 알림을 사용할 수 있습니다.', 'warning');
        }
    }

    // 하루가 지나면 루틴 초기화 (선택사항) - 이제 완료 상태는 별도 테이블에서 관리하므로 불필요
    async checkNewDay() {
        const today = new Date().toDateString();
        const lastCheck = localStorage.getItem('last-routine-check');
        
        if (lastCheck !== today) {
            localStorage.setItem('last-routine-check', today);
            // 완료 상태는 별도 테이블에서 관리하므로 초기화할 필요 없음
            console.log('새로운 하루가 시작되었습니다.');
            
            // 알림 추적 초기화
            this.lastNotificationDate = null;
            this.sentNotifications.clear();
            console.log('알림 추적이 초기화되었습니다.');
        }
    }

    // 알림 표시 메서드
    showNotification(message, type = 'info') {
        // 기존 알림이 있다면 제거
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // 새 알림 생성
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // 스타일 적용
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 1000;
            animation: slideIn 0.3s ease;
            max-width: 300px;
            word-wrap: break-word;
        `;

        // 타입별 색상 설정
        const colors = {
            success: '#48bb78',
            error: '#f56565',
            warning: '#ed8936',
            info: '#4299e1'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        // 애니메이션 CSS 추가
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // 3초 후 자동 제거
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideIn 0.3s ease reverse';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 3000);
    }
}

// 앱 초기화
let routineManager;

document.addEventListener('DOMContentLoaded', async () => {
    routineManager = new RoutineManager();
    
    // 하루가 지났는지 확인
    await routineManager.checkNewDay();
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

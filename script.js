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

        try {
            // routines 테이블의 completed 필드 업데이트
            const { error } = await this.supabase
                .from('routines')
                .update({ completed: !isCurrentlyCompleted })
                .eq('id', routineId);

            if (error) {
                console.error('루틴 상태 변경 중 오류:', error);
                this.showNotification('루틴 상태 변경 중 오류가 발생했습니다.', 'error');
                return;
            }

            // 로컬 상태 업데이트
            routine.completed = !isCurrentlyCompleted;
            
            // Map 상태도 업데이트
            if (routine.completed) {
                this.routineCompletions.set(routineId, new Date().toISOString().split('T')[0]);
            } else {
                this.routineCompletions.delete(routineId);
            }

            this.renderRoutines();
            this.updateStats();
            this.showNotification(routine.completed ? '루틴이 완료되었습니다!' : '완료가 취소되었습니다.', 'success');
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
                        📊 이력
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
            // routines 테이블에서 completed 상태를 로드
            console.log('루틴 완료 상태 로드 시작');
            
            // 완료 상태를 Map에 저장 (routines 테이블의 completed 필드 사용)
            this.routineCompletions.clear();
            
            // routines가 이미 로드되어 있으므로 completed 상태를 Map에 저장
            this.routines.forEach(routine => {
                if (routine.completed) {
                    this.routineCompletions.set(routine.id, new Date().toISOString().split('T')[0]);
                }
            });

            console.log('루틴 완료 상태 로드 성공:', this.routineCompletions);
        } catch (error) {
            console.error('루틴 완료 상태 로드 중 예외:', error);
            // 예외가 발생해도 빈 Map으로 초기화
            this.routineCompletions.clear();
        }
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
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
            
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
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식

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

            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식

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
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식

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

    // 루틴 이력 조회
    async showRoutineHistory(routineId) {
        const routine = this.routines.find(r => r.id === routineId);
        if (!routine) return;

        try {
            // 최근 30일간의 완료 이력 조회
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const startDate = thirtyDaysAgo.toISOString().split('T')[0];

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
                    <small style="color: #999;">${new Date(item.completed_at).toLocaleTimeString('ko-KR')}</small>
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

    // 주간 통계 조회
    async showWeeklyStats() {
        try {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            const startDate = oneWeekAgo.toISOString().split('T')[0];
            const endDate = new Date().toISOString().split('T')[0];

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
            const startDate = oneMonthAgo.toISOString().split('T')[0];
            const endDate = new Date().toISOString().split('T')[0];

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

    // 하루가 지나면 루틴 초기화 (선택사항) - 이제 완료 상태는 별도 테이블에서 관리하므로 불필요
    async checkNewDay() {
        const today = new Date().toDateString();
        const lastCheck = localStorage.getItem('last-routine-check');
        
        if (lastCheck !== today) {
            localStorage.setItem('last-routine-check', today);
            // 완료 상태는 별도 테이블에서 관리하므로 초기화할 필요 없음
            console.log('새로운 하루가 시작되었습니다.');
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

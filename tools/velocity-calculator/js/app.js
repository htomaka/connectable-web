(() => {
    'use strict';

    // Constants
    const CONFIG = {
        STORAGE_KEY: 'velocity-calculator-settings',
        MAX_DEVELOPERS: 50,
        MAX_VELOCITY: 1000,
        MAX_SPRINT_DAYS: 30,
        DOM_READY_DELAY: 100,
        ERROR_HIDE_DELAY: 5000,
        DEFAULT_VALUES: {
            velocity: 22,
            devCount: 3,
            sprintDays: 10,
            buildPercent: 80
        }
    };

    // Cache DOM elements
    const elements = {
        devCountInput: document.getElementById('devCount'),
        devsContainer: document.getElementById('devs-container'),
        calcBtn: document.getElementById('calcBtn'),
        velocityInput: document.getElementById('velocity'),
        sprintDaysInput: document.getElementById('sprintDays'),
        buildPercentInput: document.getElementById('buildPercent'),
        resultDiv: document.getElementById('result'),
        rememberSettingsCheckbox: document.getElementById('rememberSettings')
    };

    // Cache for dynamic elements
    let cachedAbsenceInputs = null;
    
    function getCachedAbsenceInputs() {
        if (!cachedAbsenceInputs) {
            cachedAbsenceInputs = document.querySelectorAll('.dev-absence');
        }
        return cachedAbsenceInputs;
    }
    
    function clearAbsenceInputsCache() {
        cachedAbsenceInputs = null;
    }

    // localStorage functions
    function saveSettings() {
        if (!elements.rememberSettingsCheckbox.checked) {
            return;
        }
        
        const settings = {
            velocity: elements.velocityInput.value,
            devCount: elements.devCountInput.value,
            sprintDays: elements.sprintDaysInput.value,
            buildPercent: elements.buildPercentInput.value,
            rememberSettings: true,
            absences: []
        };
        
        // Save absences for each developer
        const absenceInputs = getCachedAbsenceInputs();
        absenceInputs.forEach(input => {
            const devIndex = input.getAttribute('data-dev-index');
            settings.absences.push({
                devIndex: devIndex,
                value: input.value
            });
        });
        
        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
            console.warn('Impossible de sauvegarder les réglages:', error);
        }
    }
    
    function loadSettings() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
            let hasSettings = false;
            
            if (saved) {
                const settings = JSON.parse(saved);
                
                // Validate and apply saved values
                if (settings.velocity && !isNaN(parseFloat(settings.velocity))) {
                    elements.velocityInput.value = settings.velocity;
                    hasSettings = true;
                }
                if (settings.devCount && !isNaN(parseInt(settings.devCount))) {
                    elements.devCountInput.value = settings.devCount;
                    hasSettings = true;
                }
                if (settings.sprintDays && !isNaN(parseFloat(settings.sprintDays))) {
                    elements.sprintDaysInput.value = settings.sprintDays;
                    hasSettings = true;
                }
                if (settings.buildPercent && !isNaN(parseFloat(settings.buildPercent))) {
                    elements.buildPercentInput.value = settings.buildPercent;
                    hasSettings = true;
                }
                if (settings.rememberSettings) {
                    elements.rememberSettingsCheckbox.checked = true;
                }
                
                // Render dev rows first, then apply absences
                renderDevRows();
                
                // Apply saved absences using a more reliable approach
                applyAbsencesWithRetry(settings.absences);
            }
            
            // If no settings found, still render dev rows with default values
            if (!hasSettings) {
                renderDevRows();
            }
            
        } catch (error) {
            console.warn('Impossible de charger les réglages:', error);
            // Still render dev rows on error
            renderDevRows();
        }
    }
    
    function applyAbsencesWithRetry(absences) {
        if (!absences || !Array.isArray(absences)) {
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 5;
        
        function tryApplyAbsences() {
            attempts++;
            
            let allApplied = true;
            absences.forEach(absence => {
                const input = document.querySelector(`[data-dev-index="${absence.devIndex}"]`);
                if (input) {
                    input.value = absence.value || '0';
                } else {
                    allApplied = false;
                }
            });
            
            if (!allApplied && attempts < maxAttempts) {
                setTimeout(tryApplyAbsences, CONFIG.DOM_READY_DELAY);
            }
        }
        
        tryApplyAbsences();
    }
    
    function clearSettings() {
        try {
            localStorage.removeItem(CONFIG.STORAGE_KEY);
        } catch (error) {
            console.warn('Impossible d\'effacer les réglages:', error);
        }
    }

    // Validation helpers
    function validateInput(value, min, max, name, required = true) {
        // Check if required and empty
        if (required && (value === '' || value === null || value === undefined)) {
            showError(`${name} est requis`);
            return false;
        }
        
        // Skip validation if not required and empty
        if (!required && (value === '' || value === null || value === undefined)) {
            return true;
        }
        
        // Check if value is a valid number
        const num = parseFloat(value);
        if (isNaN(num)) {
            showError(`${name} doit être un nombre valide`);
            return false;
        }
        
        // Check range
        if (num < min || num > max) {
            showError(`${name} doit être entre ${min} et ${max}`);
            return false;
        }
        
        return true;
    }

    function validateAbsences(absenceInputs, sprintDays) {
        const errors = [];
        
        absenceInputs.forEach((input, index) => {
            const value = input.value;
            const daysAbsent = parseFloat(value) || 0;
            
            if (value !== '' && isNaN(daysAbsent)) {
                errors.push(`L'absence du développeur ${index + 1} doit être un nombre valide`);
            } else if (daysAbsent < 0) {
                errors.push(`L'absence du développeur ${index + 1} ne peut pas être négative`);
            } else if (daysAbsent > sprintDays) {
                errors.push(`L'absence du développeur ${index + 1} ne peut pas dépasser ${sprintDays} jours`);
            }
        });
        
        if (errors.length > 0) {
            showError(errors[0]); // Show first error
            return false;
        }
        
        return true;
    }

    function showError(message) {
        // Create or update error message
        let errorDiv = document.getElementById('error-message');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'error-message';
            errorDiv.className = 'bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4';
            elements.calcBtn.parentNode.insertBefore(errorDiv, elements.calcBtn);
        }
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
        
        // Auto-hide after delay
        setTimeout(() => {
            errorDiv.classList.add('hidden');
        }, CONFIG.ERROR_HIDE_DELAY);
    }

    function hideError() {
        const errorDiv = document.getElementById('error-message');
        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }
    }

    // Safe DOM manipulation
    function createDevRow(devIndex) {
        const row = document.createElement('div');
        row.className = 'flex flex-col sm:flex-row sm:items-center gap-2 gap-y-1 text-sm';
        
        const label = document.createElement('span');
        label.className = 'w-20 text-slate-700 font-medium';
        label.textContent = `Dev ${devIndex}`;
        
        const inputContainer = document.createElement('div');
        inputContainer.className = 'flex items-center gap-2';
        
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.value = '0';
        input.step = '0.5';
        input.setAttribute('data-dev-index', devIndex);
        input.className = 'dev-absence w-full sm:w-24 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:border-indigo-500 focus:ring-indigo-500';
        input.setAttribute('aria-label', `Absences développeur ${devIndex}`);
        
        const labelSuffix = document.createElement('span');
        labelSuffix.className = 'text-xs text-slate-500';
        labelSuffix.textContent = 'jours ouvrés';
        
        inputContainer.appendChild(input);
        inputContainer.appendChild(labelSuffix);
        row.appendChild(label);
        row.appendChild(inputContainer);
        
        return row;
    }

    function renderDevRows() {
        try {
            const devCount = parseInt(elements.devCountInput.value, 10);
            
            if (!validateInput(elements.devCountInput.value, 1, CONFIG.MAX_DEVELOPERS, 'Le nombre de développeurs')) {
                return;
            }

            // Clear existing rows and cache
            elements.devsContainer.innerHTML = '';
            clearAbsenceInputsCache();
            
            // Generate new rows
            for (let i = 1; i <= devCount; i++) {
                const row = createDevRow(i);
                elements.devsContainer.appendChild(row);
                
                // Add save event listener to absence inputs
                const absenceInput = row.querySelector('.dev-absence');
                if (absenceInput) {
                    absenceInput.addEventListener('input', () => {
                        if (elements.rememberSettingsCheckbox.checked) {
                            saveSettings();
                        }
                    });
                }
            }
            
            hideError();
        } catch (error) {
            showError('Erreur lors de la génération des champs');
            console.error('renderDevRows error:', error);
        }
    }

    function calculateCapacity() {
        try {
            // Validate inputs
            const velocity = elements.velocityInput.value;
            const devCount = elements.devCountInput.value;
            const sprintDays = elements.sprintDaysInput.value;
            const buildPercent = elements.buildPercentInput.value;

            if (!validateInput(velocity, 0, CONFIG.MAX_VELOCITY, 'La vélocité')) return;
            if (!validateInput(devCount, 1, CONFIG.MAX_DEVELOPERS, 'Le nombre de développeurs')) return;
            if (!validateInput(sprintDays, 1, CONFIG.MAX_SPRINT_DAYS, 'Les jours ouvrés')) return;
            if (!validateInput(buildPercent, 0, 100, 'Le pourcentage build')) return;

            // Validate absences
            const absenceInputs = getCachedAbsenceInputs();
            if (!validateAbsences(absenceInputs, parseFloat(sprintDays))) {
                return;
            }

            // Calculate absences
            let totalAbsenceDevEquiv = 0;

            absenceInputs.forEach(input => {
                const daysAbsent = parseFloat(input.value) || 0;
                const devEquiv = daysAbsent / parseFloat(sprintDays);
                totalAbsenceDevEquiv += devEquiv;
            });

            // Calculate capacity
            const lossRatio = totalAbsenceDevEquiv / parseFloat(devCount);
            const adjustedCapacity = parseFloat(velocity) * (1 - lossRatio);
            const buildCapacity = adjustedCapacity * (parseFloat(buildPercent) / 100);
            const techCapacity = adjustedCapacity - buildCapacity;

            // Display results safely
            displayResults({
                adjustedCapacity,
                buildCapacity,
                techCapacity,
                buildPercent: parseFloat(buildPercent),
                devCount: parseFloat(devCount),
                sprintDays: parseFloat(sprintDays),
                totalAbsenceDevEquiv,
                lossRatio
            });
            
            hideError();
        } catch (error) {
            showError('Une erreur est survenue lors du calcul');
            console.error('calculateCapacity error:', error);
        }
    }

    function displayResults(data) {
        const { adjustedCapacity, buildCapacity, techCapacity, buildPercent, devCount, sprintDays, totalAbsenceDevEquiv, lossRatio } = data;
        
        // Clear previous results
        elements.resultDiv.innerHTML = '';
        elements.resultDiv.classList.remove('hidden');
        
        // Create result sections safely
        const resultHTML = [
            '<h2 class="text-sm font-semibold text-slate-800 mb-3">Résultat</h2>',
            '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">',
            createResultCard('Capacité ajustée', `${adjustedCapacity.toFixed(2)} pts`, 'slate'),
            createResultCard(`Build (${buildPercent.toFixed(0)} %)`, `${buildCapacity.toFixed(2)} pts`, 'emerald'),
            createResultCard(`Fix, dette, améliorations (${(100 - buildPercent).toFixed(0)} %)`, `${techCapacity.toFixed(2)} pts`, 'amber'),
            '</div>',
            '<div class="mt-2 text-xs text-slate-500 space-y-1">',
            `<div>Équipe: ${devCount} développeurs</div>`,
            `<div>Sprint: ${sprintDays} jours ouvrés</div>`,
            `<div>Absence totale équivalente développeur: ${totalAbsenceDevEquiv.toFixed(2)}</div>`,
            `<div>Perte relative: ${(lossRatio * 100).toFixed(1)} %</div>`,
            '</div>'
        ].join('');
        
        elements.resultDiv.innerHTML = resultHTML;
    }

    function createResultCard(title, value, color) {
        const colorClasses = {
            slate: 'bg-slate-50 border-slate-200 text-slate-900',
            emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
            amber: 'bg-amber-50 border-amber-200 text-amber-900'
        };
        
        const textColors = {
            slate: 'text-slate-500',
            emerald: 'text-emerald-700',
            amber: 'text-amber-700'
        };
        
        return `
            <div class="p-3 rounded-lg ${colorClasses[color]} border">
                <div class="text-xs ${textColors[color]} mb-1">${escapeHtml(title)}</div>
                <div class="text-lg font-semibold">${escapeHtml(value)}</div>
            </div>
        `;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize event listeners
    function init() {
        if (elements.devCountInput) {
            elements.devCountInput.addEventListener('change', () => {
                renderDevRows();
                if (elements.rememberSettingsCheckbox.checked) {
                    saveSettings();
                }
            });
        }
        
        if (elements.calcBtn) {
            elements.calcBtn.addEventListener('click', calculateCapacity);
        }
        
        // Add save event listeners for main inputs
        [elements.velocityInput, elements.sprintDaysInput, elements.buildPercentInput].forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    if (elements.rememberSettingsCheckbox.checked) {
                        saveSettings();
                    }
                });
            }
        });
        
        // Add event listener for remember settings checkbox
        if (elements.rememberSettingsCheckbox) {
            elements.rememberSettingsCheckbox.addEventListener('change', () => {
                if (elements.rememberSettingsCheckbox.checked) {
                    saveSettings();
                } else {
                    clearSettings();
                }
            });
        }
        
        // Add keyboard support
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.type === 'number') {
                calculateCapacity();
            }
        });
        
        // Load settings first, then render dev rows
        loadSettings();
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// FurniCore changelog data and renderer.
(function(){
  const releases = [
    {
      version: 'v6.46',
      title: 'Changelog and Foam Editor Fix',
      date: '13.07.2026',
      description: 'Добавлен отдельный раздел истории версий и исправлена маршрутизация редактирования материалов категории Поролон.',
      added: [
        'Новый раздел бокового меню: История версий.',
        'Централизованный список релизов в js/changelog.js.',
        'Карточки версий с раскрытием описания, новых функций, исправлений, проверок и примечаний.',
        'Автоматическое отображение последней версии FurniCore в разделе истории версий.'
      ],
      fixed: [
        'Кнопка Редактировать в карточке поролона теперь открывает специальную форму поролона.',
        'Общий редактор материалов больше не перехватывает категорию Поролон.',
        'Раздел истории версий адаптирован под мобильный экран.'
      ],
      testing: [
        'Открыть раздел История версий и проверить, что v6.46 находится сверху.',
        'Развернуть и свернуть карточку версии.',
        'Открыть материал Поролон в складе и нажать Редактировать.',
        'Проверить, что открывается форма с параметрами поролона.',
        'Проверить, что обычные материалы по-прежнему открывают свои редакторы.'
      ],
      notes: [
        'Если после обновления видна старая версия, очистите кэш браузера и обновите страницу.'
      ]
    },
    {
      version: 'v6.45',
      title: 'Auto Material Consumption',
      date: '13.07.2026',
      description: 'Материалы списываются по мере фактического выполнения операций, с защитой от двойного списания и контролем остатков.',
      added: [
        'Автоматическое списание материалов по операциям производства.',
        'Подтверждение списания с расчётом материалов перед сохранением.',
        'Служебные поля consumedForQty, consumedQty и consumptionStatus для материалов заказа.',
        'Отмена последнего списания с возвратом материала на склад и восстановлением резерва.',
        'Записи в общей истории, истории заказа и истории материала.',
        'Таблица контроля материалов с колонками: на изделие, требуется, уже списано, осталось списать, остаток склада.'
      ],
      fixed: [
        'Резерв материалов теперь уменьшается вместе с фактическим списанием.',
        'Операция не списывает один и тот же объём повторно.',
        'Завершение операции учитывает фактически выполненное количество изделий.'
      ],
      testing: [
        'Частичное выполнение операции списывает только новый объём материалов.',
        'Повторное выполнение списывает только разницу, без дублей.',
        'При нехватке материала списание блокируется.',
        'Отмена последнего списания возвращает склад и резерв.',
        'История заказа, материала и сайта получает записи о списании.',
        'После обновления страницы значения выполненного и списанного не откатываются.'
      ],
      notes: [
        'Перед тестированием убедитесь, что в боковом меню отображается версия v6.45.',
        'Если видна старая версия, выполните полную очистку кэша браузера и обновите страницу.'
      ]
    },
    {
      version: 'v6.44',
      title: 'Secure Integrations Export',
      date: '13.07.2026',
      description: 'Защита Telegram-интеграции PIN-кодом и безопасный экспорт/импорт данных без случайной передачи секретов.',
      added: [
        'PIN-защита раздела Интеграции → Telegram.',
        'Скрытие Telegram Bot Token и Telegram Chat ID до повторного подтверждения PIN.',
        'Выбор разделов при экспорте JSON.',
        'Подтверждение импорта системных настроек, если они есть в файле.'
      ],
      fixed: [
        'Секретные настройки исключаются из обычного экспорта.',
        'Изменение Telegram-настроек записывается в историю без раскрытия токена.'
      ],
      testing: [
        'Telegram-раздел запрашивает PIN при каждом открытии.',
        'Экспорт без системных настроек не содержит токены, PIN, пароли и API keys.',
        'Импорт с системными настройками показывает подтверждение.'
      ],
      notes: [
        'PIN по умолчанию: 198826.'
      ]
    },
    {
      version: 'v6.43',
      title: 'Mobile Modal Header Fix',
      date: '13.07.2026',
      description: 'Исправление мобильного отображения модальных окон, чтобы кнопка меню не перекрывала заголовки и действия.',
      added: [
        'Адаптация отступов заголовка модального окна на мобильных устройствах.',
        'Более удобное расположение кнопок в нижней части модальных окон.'
      ],
      fixed: [
        'Кнопка открытия меню больше не закрывает название модального окна.',
        'Кнопки действий в модальных окнах лучше помещаются на узком экране.'
      ],
      testing: [
        'Открыть карточку материала на телефоне.',
        'Открыть добавление материала на телефоне.',
        'Проверить, что заголовок и кнопки не перекрываются.'
      ],
      notes: []
    }
  ];

  releases.sort((a,b)=>releaseTime(b)-releaseTime(a));

  window.FURNICORE_RELEASES = releases;
  window.FURNICORE_LATEST_VERSION = releaseLabel(releases[0]);
  window.renderChangelog = renderChangelog;
  window.toggleChangelogRelease = toggleChangelogRelease;

  function releaseTime(release){
    const parts = String(release.date || '').split('.');
    if(parts.length !== 3) return 0;
    return new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0])).getTime() || 0;
  }

  function releaseLabel(release){
    if(!release) return '';
    return `${release.version} — ${release.title}`;
  }

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[char]));
  }

  function listBlock(title, items, emptyText){
    const rows = Array.isArray(items) ? items.filter(Boolean) : [];
    if(!rows.length) return `<div class="changelog-block muted-block"><h4>${esc(title)}</h4><p>${esc(emptyText || 'Нет отдельных пунктов.')}</p></div>`;
    return `<div class="changelog-block"><h4>${esc(title)}</h4><ul>${rows.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></div>`;
  }

  function checklistBlock(items){
    const rows = Array.isArray(items) ? items.filter(Boolean) : [];
    return `<div class="changelog-block test-block"><h4>Что необходимо проверить</h4>${rows.length?`<ul>${rows.map(item=>`<li><span class="check-empty">□</span>${esc(item)}</li>`).join('')}</ul>`:'<p>Отдельных проверок нет.</p>'}</div>`;
  }

  function releaseCard(release, index){
    const expanded = index === 0;
    return `<article class="changelog-card ${expanded?'open':''}" data-release="${esc(release.version)}">
      <button class="changelog-head" type="button" onclick="toggleChangelogRelease('${esc(release.version)}')" aria-expanded="${expanded?'true':'false'}">
        <span class="release-mark">↗</span>
        <span class="changelog-title">
          <b>${esc(release.version)} — ${esc(release.title)}</b>
          <small>Дата: ${esc(release.date)}</small>
        </span>
        <span class="changelog-toggle">⌄</span>
      </button>
      <div class="changelog-content">
        <p class="changelog-description">${esc(release.description)}</p>
        <div class="changelog-grid">
          ${listBlock('Что добавлено', release.added)}
          ${listBlock('Что исправлено', release.fixed)}
          ${checklistBlock(release.testing)}
          ${listBlock('Важно', release.notes, 'Важных примечаний нет.')}
        </div>
      </div>
    </article>`;
  }

  function renderChangelog(){
    const list = document.getElementById('changelogList');
    if(!list) return;
    const latest = releases[0];
    const badge = document.getElementById('changelogCurrentVersion');
    if(badge) badge.textContent = latest ? `FurniCore ${releaseLabel(latest)}` : 'FurniCore';
    const summary = document.getElementById('changelogSummary');
    if(summary){
      summary.innerHTML = `<div class="changelog-stat"><small>Последняя версия</small><b>${esc(latest?.version || '—')}</b><span>${esc(latest?.title || '')}</span></div><div class="changelog-stat"><small>Дата выпуска</small><b>${esc(latest?.date || '—')}</b><span>актуальный релиз</span></div><div class="changelog-stat"><small>Всего записей</small><b>${releases.length}</b><span>новые версии сверху</span></div>`;
    }
    list.innerHTML = releases.map(releaseCard).join('');
  }

  function toggleChangelogRelease(version){
    const target = String(version);
    const card = Array.from(document.querySelectorAll('.changelog-card')).find(el => el.dataset.release === target);
    if(!card) return;
    const next = !card.classList.contains('open');
    card.classList.toggle('open', next);
    const btn = card.querySelector('.changelog-head');
    if(btn) btn.setAttribute('aria-expanded', next ? 'true' : 'false');
  }

  function boot(){
    renderChangelog();
    const oldRenderAll = window.renderAll;
    if(typeof oldRenderAll === 'function' && !oldRenderAll.__changelogWrapped){
      const wrapped = function(){
        oldRenderAll.apply(this, arguments);
        renderChangelog();
      };
      wrapped.__changelogWrapped = true;
      window.renderAll = wrapped;
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

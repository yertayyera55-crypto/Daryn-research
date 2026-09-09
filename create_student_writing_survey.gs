/**
 * Creates the anonymous needs-assessment survey for the Student Writing
 * Feedback project.
 *
 * Run createStudentWritingSurvey() once per execution. Each execution creates
 * one new Form and one linked response spreadsheet; the script does not search
 * for or modify an existing form.
 */
function createStudentWritingSurvey() {
  var form = FormApp.create('Student Writing Feedback Survey', true);

  form.setDescription(
    'Этот анонимный опрос проводится в рамках школьного научного проекта об использовании AI для поддержки изучающих английский язык при выполнении письменных заданий.\n\n' +
    'Цель — понять, с какими трудностями учащиеся сталкиваются при Writing, как они используют feedback и какой формат помощи считают наиболее полезным.\n\n' +
    'Опрос занимает примерно 3–4 минуты.\n\n' +
    'Ответы будут анализироваться только в обобщённом виде. Имя, email и другие персональные идентификаторы не собираются.'
  );

  // Privacy and response settings.
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  form.setIsQuiz(false);
  form.setShuffleQuestions(false);
  form.setProgressBar(true);
  form.setPublishingSummary(false);
  form.setShowLinkToRespondAgain(false);

  // This method is deprecated in newer Forms environments, but where it is
  // still exposed it explicitly keeps the form open to non-logged-in users.
  if (typeof form.setRequireLogin === 'function') {
    form.setRequireLogin(false);
  }

  // Section 1: About your writing experience.
  addSection(form, 'About your writing experience',
    'Эти вопросы описывают ваш общий опыт изучения английского и письменных заданий.');

  addMultipleChoice(form,
    'Какой у вас сейчас уровень английского языка?',
    ['A1–A2', 'B1', 'B2', 'C1', 'C2', 'Не знаю точно'], true);

  addMultipleChoice(form,
    'Готовились ли вы когда-либо к IELTS, TOEFL или другому экзамену, включающему Writing?',
    ['Сейчас готовлюсь', 'Готовился(ась) раньше',
      'Не готовился(ась), но регулярно пишу тексты на английском',
      'Практически не пишу тексты на английском'], true);

  addMultipleChoice(form,
    'Как часто вы пишете эссе или другие развёрнутые тексты на английском?',
    ['Несколько раз в неделю', 'Примерно раз в неделю', 'Несколько раз в месяц',
      'Реже одного раза в месяц', 'Практически никогда'], true);

  // Section 2: Recurring errors and feedback.
  addSection(form, 'Recurring errors and feedback',
    'Эти вопросы относятся к повторяющимся ошибкам и тому, что происходит с feedback после проверки.');

  addScale(form,
    'Как часто вы замечаете, что повторяете одну и ту же грамматическую или языковую ошибку в разных письменных работах?',
    1, 5, 'Никогда', 'Очень часто', true);

  addMultipleChoice(form,
    'Бывало ли, что преподаватель или AI уже объяснял вам определённую ошибку, но в следующей работе вы снова её совершали?',
    ['Да, часто', 'Да, иногда', 'Очень редко', 'Нет', 'Не уверен(а)'], true);

  addScale(form,
    'Насколько хорошо вы обычно помните feedback из предыдущих письменных работ, когда начинаете писать новую?',
    1, 5, 'Почти ничего не помню', 'Хорошо помню и активно применяю', true);

  addMultipleChoice(form,
    'Что обычно происходит с feedback после того, как вы получили проверку своей письменной работы?',
    ['Я внимательно разбираю ошибки и стараюсь помнить их в следующих работах',
      'Я просматриваю feedback, но редко возвращаюсь к нему позже',
      'Я в основном смотрю на исправленный вариант',
      'Я редко подробно изучаю feedback',
      'Обычно я вообще не получаю feedback'], true);

  // Section 3: Current feedback habits.
  addSection(form, 'Current feedback habits',
    'Эти вопросы описывают способы проверки Writing, которыми вы пользуетесь сейчас.');

  addCheckboxes(form,
    'Какие способы проверки английского Writing вы используете?',
    ['Преподаватель', 'ChatGPT или другая LLM', 'Grammarly или похожий grammar checker',
      'Проверяю самостоятельно', 'Одноклассник / друг', 'Другой способ',
      'Обычно не проверяю'], false);

  addMultipleChoice(form,
    'Если вы используете AI для Writing, когда чаще всего вы обращаетесь к нему?',
    ['До начала writing', 'Во время writing', 'После завершения отдельного абзаца',
      'После завершения всего текста', 'Не использую AI для Writing'], true);

  addMultipleChoice(form,
    'Какой тип feedback обычно помогает вам лучше учиться?',
    ['AI сразу показывает правильный вариант',
      'AI указывает место ошибки, но не исправляет её',
      'AI даёт небольшую подсказку, чтобы я сам(а) нашёл(ла) исправление',
      'AI подробно объясняет правило',
      'Feedback от преподавателя полезнее AI', 'Не уверен(а)'], true);

  addMultipleChoice(form,
    'Когда вам было бы удобнее получать предупреждение о повторяющейся ошибке?',
    ['До начала writing', 'Сразу во время writing', 'После завершения предложения',
      'После завершения абзаца', 'Только после завершения всего текста',
      'Я бы не хотел(а) получать такие предупреждения'], true);

  addScale(form,
    'Насколько частые AI-подсказки во время writing могли бы отвлекать вас?',
    1, 5, 'Совсем не отвлекали бы', 'Очень сильно отвлекали бы', true);

  // Section 4: Product perception. The concept is intentionally introduced
  // only after the problem and current-behavior questions.
  addSection(form, 'Personalized Writing Mentor',
    'Представьте AI Writing Mentor, который сохраняет структурированную историю ваших повторяющихся ошибок из прошлых письменных работ.\n\n' +
    'Например, система знает, что в нескольких предыдущих эссе вы повторяли одну и ту же ошибку с временами или артиклями.\n\n' +
    'Во время новой письменной работы система следит прежде всего за вашими индивидуальными recurring errors. Если одна из них снова появляется, AI даёт короткую подсказку, но не исправляет предложение автоматически.\n\n' +
    'Цель — помочь ученику самостоятельно заметить и исправить свою типичную ошибку.');

  addScale(form,
    'Насколько полезной лично для вас кажется такая система?',
    1, 5, 'Совсем не полезной', 'Очень полезной', true);

  addMultipleChoice(form,
    'Какой вариант вы бы предпочли?',
    ['Обычный AI, который проверяет все ошибки после написания текста',
      'Персонализированный AI, который знает мои прошлые recurring errors и даёт selective hints во время writing',
      'Комбинацию обоих вариантов', 'Я бы предпочёл(ла) feedback от человека', 'Не уверен(а)'], true);

  addMultipleChoice(form,
    'Хотели бы вы попробовать такой Personalized Writing Mentor на реальном writing задании?',
    ['Да', 'Возможно', 'Нет'], true);

  addCheckboxes(form,
    'Что было бы самым важным для вас в такой системе?',
    ['Чтобы она помнила мои прошлые ошибки', 'Чтобы подсказки появлялись в правильный момент',
      'Чтобы она не писала текст вместо меня', 'Чтобы она объясняла правило',
      'Чтобы она не отвлекала слишком часто', 'Чтобы данные о моих работах оставались приватными',
      'Другое'], false);

  form.addParagraphTextItem()
    .setTitle('Есть ли у вас замечания или идеи о том, как AI мог бы действительно помочь вам улучшить Writing?')
    .setRequired(false);

  // Create a linked response spreadsheet without adding formulas or analysis.
  var responseSheet = SpreadsheetApp.create('Student Writing Feedback Survey — Responses');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, responseSheet.getId());

  form.setConfirmationMessage('Спасибо! Ваш анонимный ответ сохранён.');

  Logger.log('Edit URL: ' + form.getEditUrl());
  Logger.log('Public URL: ' + form.getPublishedUrl());
  Logger.log('Form ID: ' + form.getId());
  Logger.log('Collect email: ' + form.collectsEmail());
  Logger.log('Responses Sheet URL: ' + responseSheet.getUrl());
}

function addSection(form, title, description) {
  form.addPageBreakItem()
    .setTitle(title)
    .setHelpText(description);
}

function addMultipleChoice(form, title, choices, required) {
  form.addMultipleChoiceItem()
    .setTitle(title)
    .setChoiceValues(choices)
    .setRequired(required);
}

function addCheckboxes(form, title, choices, required) {
  form.addCheckboxItem()
    .setTitle(title)
    .setChoiceValues(choices)
    .setRequired(required);
}

function addScale(form, title, lowerBound, upperBound, lowerLabel, upperLabel, required) {
  form.addScaleItem()
    .setTitle(title)
    .setBounds(lowerBound, upperBound)
    .setLabels(lowerLabel, upperLabel)
    .setRequired(required);
}

// Migration 073: dynamic surveys.
// Adds survey_questions (structural, language-independent) and survey_translations
// (one JSONB blob per language: page text, question labels, email copy). Then seeds
// the existing 'may-2026-survey' (created in migration 070) with its questions and
// all 11 language blobs, lifted verbatim from the survey.may2026.* i18n keys so the
// hardcoded TS constant + i18n keys can be removed. Existing survey_answers keep the
// same question_key values, so prior responses stay valid.

class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
  async tableExists(sql, tableName) {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tableName}
      ) as exists
    `
    return result[0]?.exists || false
  }
}

const QUESTIONS = [
  {
    "key": "focus",
    "type": "scale",
    "position": 0,
    "config": {
      "min": 1,
      "max": 5,
      "scalePoints": [
        1,
        5
      ]
    }
  },
  {
    "key": "experience",
    "type": "text",
    "position": 1,
    "config": {}
  },
  {
    "key": "clarity",
    "type": "scale",
    "position": 2,
    "config": {
      "min": 1,
      "max": 5,
      "scalePoints": [
        1,
        5
      ]
    }
  },
  {
    "key": "content_amount",
    "type": "scale",
    "position": 3,
    "config": {
      "min": 1,
      "max": 5,
      "scalePoints": [
        1,
        3,
        5
      ]
    }
  },
  {
    "key": "heart",
    "type": "text",
    "position": 4,
    "config": {}
  }
]

const TRANSLATIONS = {
  "en": {
    "page": {
      "title": "Your prayer experience",
      "intro": "Thank you for praying with DOXA. These five questions take about three minutes, and your answers help us shape the daily prayer prompts. There are no right or wrong answers — we just want your honest experience.",
      "submit": "Send my responses",
      "thanksTitle": "Thank you!",
      "thanks": "Thank you — your responses are in. We're grateful for the time you took, and for your prayers.",
      "editNotice": "You've already responded — thank you! You can update your answers below and resave if you'd like.",
      "invalidTitle": "Invalid link",
      "invalid": "This survey link doesn't look valid. Please use the link from your email, or contact us if you need help.",
      "closedTitle": "Survey closed",
      "closed": "This survey is no longer accepting responses. Thank you for your interest.",
      "goHome": "Go to homepage",
      "errorTitle": "Something went wrong",
      "error": "We couldn't save your responses. Please try again."
    },
    "questions": {
      "focus": {
        "label": "How well did the daily prayer prompts help you feel focused and engaged in praying for unreached peoples?",
        "scale": {
          "1": "Not at all focused",
          "5": "Extremely focused"
        }
      },
      "experience": {
        "label": "Tell us more about your experience — what made the prompts feel helpful (or not) for you personally?"
      },
      "clarity": {
        "label": "How clearly did the prayer prompts communicate what to pray for and why it matters?",
        "scale": {
          "1": "Very unclear",
          "5": "Very clear"
        }
      },
      "content_amount": {
        "label": "Does the amount of prayer content match the time you have to pray?",
        "scale": {
          "1": "Too much for my prayer time",
          "3": "Just right",
          "5": "Too little for my prayer time"
        }
      },
      "heart": {
        "label": "How has participating in this prayer campaign affected your heart or perspective toward unreached peoples?"
      }
    },
    "email": {
      "subject": "Would you share how prayer has been going?",
      "header": "We'd love your feedback",
      "greeting": "Hi {name},",
      "greeting_fallback": "Hi there,",
      "cta": "Take the survey",
      "signoff": "With gratitude,",
      "team": "The DOXA team",
      "body": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Thank you for standing in prayer for the unreached peoples of the world. Your faithfulness is the heart of what DOXA exists to support."
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "We're always trying to make the daily prayer prompts more helpful, and before we meet as a team to plan what's next, we'd love to hear from you. Would you take a few minutes to answer five short questions about your experience?"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Your honest feedback — what's working, what isn't — directly shapes the prayer content we create."
              }
            ]
          }
        ]
      }
    }
  },
  "es": {
    "page": {
      "title": "Tu experiencia de oración",
      "intro": "Gracias por orar con DOXA. Estas cinco preguntas toman unos tres minutos, y tus respuestas nos ayudan a mejorar las indicaciones de oración diaria. No hay respuestas correctas ni incorrectas; solo queremos conocer tu experiencia sincera.",
      "submit": "Enviar mis respuestas",
      "thanksTitle": "¡Gracias!",
      "thanks": "Gracias: hemos recibido tus respuestas. Agradecemos el tiempo que dedicaste y tus oraciones.",
      "editNotice": "Ya respondiste, ¡gracias! Puedes actualizar tus respuestas a continuación y guardarlas de nuevo si lo deseas.",
      "invalidTitle": "Enlace no válido",
      "invalid": "Este enlace de la encuesta no parece válido. Usa el enlace de tu correo o contáctanos si necesitas ayuda.",
      "closedTitle": "Encuesta cerrada",
      "closed": "Esta encuesta ya no acepta respuestas. Gracias por tu interés.",
      "goHome": "Ir a la página principal",
      "errorTitle": "Algo salió mal",
      "error": "No pudimos guardar tus respuestas. Inténtalo de nuevo."
    },
    "questions": {
      "focus": {
        "label": "¿Qué tan bien te ayudaron las indicaciones de oración diaria a sentirte concentrado y comprometido al orar por los grupos étnicos no alcanzados?",
        "scale": {
          "1": "Nada concentrado",
          "5": "Muy concentrado"
        }
      },
      "experience": {
        "label": "Cuéntanos más sobre tu experiencia: ¿qué hizo que las indicaciones te resultaran útiles (o no) personalmente?"
      },
      "clarity": {
        "label": "¿Con qué claridad comunicaban las indicaciones de oración por qué orar y por qué es importante?",
        "scale": {
          "1": "Muy poco claras",
          "5": "Muy claras"
        }
      },
      "content_amount": {
        "label": "¿La cantidad de contenido de oración se ajusta al tiempo que tienes para orar?",
        "scale": {
          "1": "Demasiado para mi tiempo de oración",
          "3": "Justo lo adecuado",
          "5": "Muy poco para mi tiempo de oración"
        }
      },
      "heart": {
        "label": "¿Cómo ha afectado tu participación en esta campaña de oración a tu corazón o tu perspectiva hacia los grupos étnicos no alcanzados?"
      }
    },
    "email": {
      "subject": "¿Nos cuentas cómo ha ido la oración?",
      "header": "Nos encantaría tu opinión",
      "greeting": "Hola {name}:",
      "greeting_fallback": "Hola:",
      "cta": "Responder la encuesta",
      "signoff": "Con gratitud,",
      "team": "El equipo de DOXA",
      "body": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Gracias por interceder en oración por los grupos étnicos no alcanzados del mundo. Tu fidelidad es el corazón de lo que DOXA existe para apoyar."
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Siempre buscamos que las indicaciones de oración diaria sean más útiles y, antes de reunirnos como equipo para planificar los próximos pasos, nos encantaría escucharte. ¿Podrías dedicar unos minutos a responder cinco preguntas breves sobre tu experiencia?"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Tu opinión sincera —lo que funciona y lo que no— moldea directamente el contenido de oración que creamos."
              }
            ]
          }
        ]
      }
    }
  },
  "fr": {
    "page": {
      "title": "Votre expérience de prière",
      "intro": "Merci de prier avec DOXA. Ces cinq questions prennent environ trois minutes, et vos réponses nous aident à améliorer les sujets de prière quotidiens. Il n'y a pas de bonne ou de mauvaise réponse ; nous voulons simplement connaître votre expérience sincère.",
      "submit": "Envoyer mes réponses",
      "thanksTitle": "Merci !",
      "thanks": "Merci, vos réponses ont bien été enregistrées. Nous vous sommes reconnaissants du temps que vous avez consacré et de vos prières.",
      "editNotice": "Vous avez déjà répondu, merci ! Vous pouvez modifier vos réponses ci-dessous et les enregistrer à nouveau si vous le souhaitez.",
      "invalidTitle": "Lien invalide",
      "invalid": "Ce lien d'enquête ne semble pas valide. Veuillez utiliser le lien de votre e-mail ou nous contacter si vous avez besoin d'aide.",
      "closedTitle": "Enquête clôturée",
      "closed": "Cette enquête n'accepte plus de réponses. Merci de votre intérêt.",
      "goHome": "Aller à l'accueil",
      "errorTitle": "Une erreur s'est produite",
      "error": "Nous n'avons pas pu enregistrer vos réponses. Veuillez réessayer."
    },
    "questions": {
      "focus": {
        "label": "Dans quelle mesure les sujets de prière quotidiens vous ont-ils aidé à vous sentir concentré et engagé dans la prière pour les groupes ethniques non-atteints ?",
        "scale": {
          "1": "Pas du tout concentré",
          "5": "Extrêmement concentré"
        }
      },
      "experience": {
        "label": "Parlez-nous davantage de votre expérience : qu'est-ce qui a rendu les sujets de prière utiles (ou non) pour vous personnellement ?"
      },
      "clarity": {
        "label": "Avec quelle clarté les sujets de prière indiquaient-ils quoi prier et pourquoi c'est important ?",
        "scale": {
          "1": "Très peu clairs",
          "5": "Très clairs"
        }
      },
      "content_amount": {
        "label": "La quantité de contenu de prière correspond-elle au temps dont vous disposez pour prier ?",
        "scale": {
          "1": "Trop pour mon temps de prière",
          "3": "Juste comme il faut",
          "5": "Trop peu pour mon temps de prière"
        }
      },
      "heart": {
        "label": "Comment votre participation à cette campagne de prière a-t-elle influencé votre cœur ou votre regard envers les groupes ethniques non-atteints ?"
      }
    },
    "email": {
      "subject": "Nous raconteriez-vous comment se passe la prière ?",
      "header": "Votre avis nous intéresse",
      "greeting": "Bonjour {name},",
      "greeting_fallback": "Bonjour,",
      "cta": "Répondre à l'enquête",
      "signoff": "Avec gratitude,",
      "team": "L'équipe DOXA",
      "body": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Merci d'intercéder dans la prière pour les groupes ethniques non-atteints du monde. Votre fidélité est au cœur de ce que DOXA cherche à soutenir."
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Nous cherchons toujours à rendre les sujets de prière quotidiens plus utiles et, avant de nous réunir en équipe pour planifier la suite, nous aimerions beaucoup vous entendre. Pourriez-vous prendre quelques minutes pour répondre à cinq courtes questions sur votre expérience ?"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Votre avis sincère — ce qui fonctionne, ce qui ne fonctionne pas — façonne directement le contenu de prière que nous créons."
              }
            ]
          }
        ]
      }
    }
  },
  "de": {
    "page": {
      "title": "Ihre Gebetserfahrung",
      "intro": "Danke, dass Sie mit DOXA beten. Diese fünf Fragen dauern etwa drei Minuten, und Ihre Antworten helfen uns, die täglichen Gebetsanliegen zu verbessern. Es gibt keine richtigen oder falschen Antworten – wir möchten einfach Ihre ehrliche Erfahrung erfahren.",
      "submit": "Meine Antworten senden",
      "thanksTitle": "Vielen Dank!",
      "thanks": "Danke – Ihre Antworten sind eingegangen. Wir sind dankbar für Ihre Zeit und Ihre Gebete.",
      "editNotice": "Sie haben bereits geantwortet – vielen Dank! Sie können Ihre Antworten unten aktualisieren und erneut speichern, wenn Sie möchten.",
      "invalidTitle": "Ungültiger Link",
      "invalid": "Dieser Umfrage-Link scheint ungültig zu sein. Bitte verwenden Sie den Link aus Ihrer E-Mail oder kontaktieren Sie uns, wenn Sie Hilfe benötigen.",
      "closedTitle": "Umfrage geschlossen",
      "closed": "Diese Umfrage nimmt keine Antworten mehr an. Vielen Dank für Ihr Interesse.",
      "goHome": "Zur Startseite",
      "errorTitle": "Etwas ist schiefgelaufen",
      "error": "Wir konnten Ihre Antworten nicht speichern. Bitte versuchen Sie es erneut."
    },
    "questions": {
      "focus": {
        "label": "Wie gut haben Ihnen die täglichen Gebetsanliegen geholfen, sich beim Gebet für unerreichte Volksgruppen konzentriert und eingebunden zu fühlen?",
        "scale": {
          "1": "Überhaupt nicht konzentriert",
          "5": "Äußerst konzentriert"
        }
      },
      "experience": {
        "label": "Erzählen Sie uns mehr über Ihre Erfahrung: Was hat die Gebetsanliegen für Sie persönlich hilfreich (oder nicht hilfreich) gemacht?"
      },
      "clarity": {
        "label": "Wie klar haben die Gebetsanliegen vermittelt, wofür zu beten ist und warum es wichtig ist?",
        "scale": {
          "1": "Sehr unklar",
          "5": "Sehr klar"
        }
      },
      "content_amount": {
        "label": "Passt die Menge an Gebetsinhalten zu der Zeit, die Sie zum Beten haben?",
        "scale": {
          "1": "Zu viel für meine Gebetszeit",
          "3": "Genau richtig",
          "5": "Zu wenig für meine Gebetszeit"
        }
      },
      "heart": {
        "label": "Wie hat die Teilnahme an dieser Gebetskampagne Ihr Herz oder Ihre Sichtweise gegenüber unerreichten Volksgruppen verändert?"
      }
    },
    "email": {
      "subject": "Erzählen Sie uns, wie das Gebet läuft?",
      "header": "Wir freuen uns über Ihr Feedback",
      "greeting": "Hallo {name},",
      "greeting_fallback": "Hallo,",
      "cta": "An der Umfrage teilnehmen",
      "signoff": "Mit Dankbarkeit,",
      "team": "Das DOXA-Team",
      "body": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Danke, dass Sie im Gebet für die unerreichten Volksgruppen der Welt einstehen. Ihre Treue ist das Herzstück dessen, was DOXA unterstützen möchte."
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Wir möchten die täglichen Gebetsanliegen immer hilfreicher gestalten, und bevor wir uns als Team treffen, um die nächsten Schritte zu planen, würden wir gerne von Ihnen hören. Würden Sie sich ein paar Minuten Zeit nehmen, um fünf kurze Fragen zu Ihrer Erfahrung zu beantworten?"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Ihr ehrliches Feedback – was funktioniert und was nicht – prägt direkt die Gebetsinhalte, die wir erstellen."
              }
            ]
          }
        ]
      }
    }
  },
  "pt": {
    "page": {
      "title": "Sua experiência de oração",
      "intro": "Obrigado por orar com a DOXA. Estas cinco perguntas levam cerca de três minutos, e suas respostas nos ajudam a aprimorar os motivos de oração diários. Não há respostas certas ou erradas; queremos apenas conhecer sua experiência sincera.",
      "submit": "Enviar minhas respostas",
      "thanksTitle": "Obrigado!",
      "thanks": "Obrigado — suas respostas foram recebidas. Somos gratos pelo tempo que você dedicou e por suas orações.",
      "editNotice": "Você já respondeu, obrigado! Você pode atualizar suas respostas abaixo e salvar novamente, se quiser.",
      "invalidTitle": "Link inválido",
      "invalid": "Este link da pesquisa não parece válido. Use o link do seu e-mail ou entre em contato conosco se precisar de ajuda.",
      "closedTitle": "Pesquisa encerrada",
      "closed": "Esta pesquisa não está mais aceitando respostas. Obrigado pelo seu interesse.",
      "goHome": "Ir para a página inicial",
      "errorTitle": "Algo deu errado",
      "error": "Não conseguimos salvar suas respostas. Tente novamente."
    },
    "questions": {
      "focus": {
        "label": "O quanto os motivos de oração diários ajudaram você a se sentir focado e envolvido ao orar pelos grupos étnicos não alcançados?",
        "scale": {
          "1": "Nada focado",
          "5": "Extremamente focado"
        }
      },
      "experience": {
        "label": "Conte-nos mais sobre sua experiência: o que tornou os motivos de oração úteis (ou não) para você pessoalmente?"
      },
      "clarity": {
        "label": "Com que clareza os motivos de oração comunicavam pelo que orar e por que isso importa?",
        "scale": {
          "1": "Muito pouco claros",
          "5": "Muito claros"
        }
      },
      "content_amount": {
        "label": "A quantidade de conteúdo de oração corresponde ao tempo que você tem para orar?",
        "scale": {
          "1": "Demais para o meu tempo de oração",
          "3": "Na medida certa",
          "5": "Pouco para o meu tempo de oração"
        }
      },
      "heart": {
        "label": "Como a sua participação nesta campanha de oração afetou o seu coração ou a sua perspectiva em relação aos grupos étnicos não alcançados?"
      }
    },
    "email": {
      "subject": "Você nos conta como tem sido a oração?",
      "header": "Adoraríamos ouvir sua opinião",
      "greeting": "Olá, {name},",
      "greeting_fallback": "Olá,",
      "cta": "Responder à pesquisa",
      "signoff": "Com gratidão,",
      "team": "A equipe DOXA",
      "body": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Obrigado por interceder em oração pelos grupos étnicos não alcançados do mundo. Sua fidelidade é o coração daquilo que a DOXA existe para apoiar."
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Estamos sempre buscando tornar os motivos de oração diários mais úteis e, antes de nos reunirmos como equipe para planejar os próximos passos, gostaríamos muito de ouvir você. Você poderia dedicar alguns minutos para responder a cinco perguntas curtas sobre sua experiência?"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Sua opinião sincera — o que está funcionando e o que não está — molda diretamente o conteúdo de oração que criamos."
              }
            ]
          }
        ]
      }
    }
  },
  "ru": {
    "page": {
      "title": "Ваш опыт молитвы",
      "intro": "Спасибо, что молитесь вместе с DOXA. Эти пять вопросов займут около трёх минут, а ваши ответы помогут нам улучшать ежедневные молитвенные подсказки. Здесь нет правильных или неправильных ответов — мы просто хотим узнать ваш искренний опыт.",
      "submit": "Отправить мои ответы",
      "thanksTitle": "Спасибо!",
      "thanks": "Спасибо — ваши ответы получены. Мы благодарны за уделённое время и за ваши молитвы.",
      "editNotice": "Вы уже ответили — спасибо! При желании вы можете обновить свои ответы ниже и сохранить их заново.",
      "invalidTitle": "Недействительная ссылка",
      "invalid": "Похоже, эта ссылка на опрос недействительна. Пожалуйста, используйте ссылку из вашего письма или свяжитесь с нами, если нужна помощь.",
      "closedTitle": "Опрос закрыт",
      "closed": "Этот опрос больше не принимает ответы. Спасибо за интерес.",
      "goHome": "На главную страницу",
      "errorTitle": "Что-то пошло не так",
      "error": "Не удалось сохранить ваши ответы. Пожалуйста, попробуйте ещё раз."
    },
    "questions": {
      "focus": {
        "label": "Насколько ежедневные молитвенные подсказки помогали вам сосредоточиться и быть вовлечёнными в молитву о недостигнутых этнических группах?",
        "scale": {
          "1": "Совсем не сосредоточен",
          "5": "Крайне сосредоточен"
        }
      },
      "experience": {
        "label": "Расскажите подробнее о своём опыте: что делало подсказки полезными (или нет) лично для вас?"
      },
      "clarity": {
        "label": "Насколько ясно молитвенные подсказки сообщали, о чём молиться и почему это важно?",
        "scale": {
          "1": "Очень неясно",
          "5": "Очень ясно"
        }
      },
      "content_amount": {
        "label": "Соответствует ли объём молитвенного материала времени, которое у вас есть для молитвы?",
        "scale": {
          "1": "Слишком много для моего молитвенного времени",
          "3": "В самый раз",
          "5": "Слишком мало для моего молитвенного времени"
        }
      },
      "heart": {
        "label": "Как участие в этой молитвенной кампании повлияло на ваше сердце или взгляд на недостигнутые этнические группы?"
      }
    },
    "email": {
      "subject": "Поделитесь, как проходит молитва?",
      "header": "Нам важно ваше мнение",
      "greeting": "Здравствуйте, {name}!",
      "greeting_fallback": "Здравствуйте!",
      "cta": "Пройти опрос",
      "signoff": "С благодарностью,",
      "team": "Команда DOXA",
      "body": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Спасибо за то, что стоите в молитве о недостигнутых этнических группах мира. Ваша верность — это сердце того, ради чего существует DOXA."
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Мы всегда стремимся сделать ежедневные молитвенные подсказки полезнее, и прежде чем собраться командой для планирования дальнейших шагов, нам очень хотелось бы услышать вас. Не могли бы вы уделить несколько минут, чтобы ответить на пять коротких вопросов о вашем опыте?"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Ваш искренний отзыв — что работает, а что нет — напрямую формирует молитвенный материал, который мы создаём."
              }
            ]
          }
        ]
      }
    }
  },
  "it": {
    "page": {
      "title": "La tua esperienza di preghiera",
      "intro": "Grazie per pregare con DOXA. Queste cinque domande richiedono circa tre minuti e le tue risposte ci aiutano a migliorare gli spunti di preghiera quotidiani. Non ci sono risposte giuste o sbagliate: vogliamo solo conoscere la tua esperienza sincera.",
      "submit": "Invia le mie risposte",
      "thanksTitle": "Grazie!",
      "thanks": "Grazie: abbiamo ricevuto le tue risposte. Ti siamo grati per il tempo che hai dedicato e per le tue preghiere.",
      "editNotice": "Hai già risposto, grazie! Puoi aggiornare le tue risposte qui sotto e salvarle di nuovo, se vuoi.",
      "invalidTitle": "Link non valido",
      "invalid": "Questo link al sondaggio non sembra valido. Usa il link della tua email oppure contattaci se hai bisogno di aiuto.",
      "closedTitle": "Sondaggio chiuso",
      "closed": "Questo sondaggio non accetta più risposte. Grazie per il tuo interesse.",
      "goHome": "Vai alla home page",
      "errorTitle": "Qualcosa è andato storto",
      "error": "Non siamo riusciti a salvare le tue risposte. Riprova."
    },
    "questions": {
      "focus": {
        "label": "Quanto gli spunti di preghiera quotidiani ti hanno aiutato a sentirti concentrato e coinvolto nel pregare per i gruppi etnici non raggiunti?",
        "scale": {
          "1": "Per niente concentrato",
          "5": "Estremamente concentrato"
        }
      },
      "experience": {
        "label": "Raccontaci di più sulla tua esperienza: cosa ha reso gli spunti di preghiera utili (o no) per te personalmente?"
      },
      "clarity": {
        "label": "Con quanta chiarezza gli spunti di preghiera comunicavano per cosa pregare e perché è importante?",
        "scale": {
          "1": "Molto poco chiari",
          "5": "Molto chiari"
        }
      },
      "content_amount": {
        "label": "La quantità di contenuti di preghiera corrisponde al tempo che hai per pregare?",
        "scale": {
          "1": "Troppi per il mio tempo di preghiera",
          "3": "Quantità giusta",
          "5": "Troppo pochi per il mio tempo di preghiera"
        }
      },
      "heart": {
        "label": "Come ha influito la tua partecipazione a questa campagna di preghiera sul tuo cuore o sulla tua prospettiva verso i gruppi etnici non raggiunti?"
      }
    },
    "email": {
      "subject": "Ci racconti come sta andando la preghiera?",
      "header": "Ci piacerebbe conoscere la tua opinione",
      "greeting": "Ciao {name},",
      "greeting_fallback": "Ciao,",
      "cta": "Rispondi al sondaggio",
      "signoff": "Con gratitudine,",
      "team": "Il team DOXA",
      "body": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Grazie per intercedere in preghiera per i gruppi etnici non raggiunti del mondo. La tua fedeltà è il cuore di ciò che DOXA esiste per sostenere."
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Cerchiamo sempre di rendere gli spunti di preghiera quotidiani più utili e, prima di incontrarci come squadra per pianificare i prossimi passi, ci piacerebbe molto ascoltarti. Potresti dedicare qualche minuto a rispondere a cinque brevi domande sulla tua esperienza?"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "La tua opinione sincera — ciò che funziona e ciò che non funziona — plasma direttamente i contenuti di preghiera che creiamo."
              }
            ]
          }
        ]
      }
    }
  },
  "ro": {
    "page": {
      "title": "Experiența ta de rugăciune",
      "intro": "Îți mulțumim că te rogi alături de DOXA. Aceste cinci întrebări durează aproximativ trei minute, iar răspunsurile tale ne ajută să îmbunătățim subiectele zilnice de rugăciune. Nu există răspunsuri corecte sau greșite — vrem doar să aflăm experiența ta sinceră.",
      "submit": "Trimite răspunsurile mele",
      "thanksTitle": "Mulțumim!",
      "thanks": "Mulțumim — am primit răspunsurile tale. Îți suntem recunoscători pentru timpul acordat și pentru rugăciunile tale.",
      "editNotice": "Ai răspuns deja — mulțumim! Poți actualiza răspunsurile mai jos și le poți salva din nou dacă dorești.",
      "invalidTitle": "Link nevalid",
      "invalid": "Acest link al sondajului nu pare valid. Te rugăm să folosești linkul din e-mailul tău sau să ne contactezi dacă ai nevoie de ajutor.",
      "closedTitle": "Sondaj închis",
      "closed": "Acest sondaj nu mai acceptă răspunsuri. Îți mulțumim pentru interes.",
      "goHome": "Mergi la pagina principală",
      "errorTitle": "Ceva nu a mers bine",
      "error": "Nu am putut salva răspunsurile tale. Te rugăm să încerci din nou."
    },
    "questions": {
      "focus": {
        "label": "Cât de mult te-au ajutat subiectele zilnice de rugăciune să te simți concentrat și implicat în rugăciunea pentru grupurile etnice neatinse?",
        "scale": {
          "1": "Deloc concentrat",
          "5": "Extrem de concentrat"
        }
      },
      "experience": {
        "label": "Spune-ne mai multe despre experiența ta: ce a făcut ca subiectele de rugăciune să fie utile (sau nu) pentru tine personal?"
      },
      "clarity": {
        "label": "Cât de clar comunicau subiectele de rugăciune pentru ce să te rogi și de ce contează?",
        "scale": {
          "1": "Foarte neclare",
          "5": "Foarte clare"
        }
      },
      "content_amount": {
        "label": "Cantitatea de conținut de rugăciune corespunde timpului pe care îl ai pentru rugăciune?",
        "scale": {
          "1": "Prea mult pentru timpul meu de rugăciune",
          "3": "Exact potrivit",
          "5": "Prea puțin pentru timpul meu de rugăciune"
        }
      },
      "heart": {
        "label": "Cum ți-a influențat participarea la această campanie de rugăciune inima sau perspectiva față de grupurile etnice neatinse?"
      }
    },
    "email": {
      "subject": "Ne spui cum a mers rugăciunea?",
      "header": "Ne-ar plăcea să aflăm părerea ta",
      "greeting": "Bună, {name},",
      "greeting_fallback": "Bună,",
      "cta": "Completează sondajul",
      "signoff": "Cu recunoștință,",
      "team": "Echipa DOXA",
      "body": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Îți mulțumim că stai în rugăciune pentru grupurile etnice neatinse ale lumii. Credincioșia ta este inima a ceea ce DOXA dorește să sprijine."
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Căutăm mereu să facem subiectele zilnice de rugăciune mai utile și, înainte de a ne întâlni ca echipă pentru a planifica pașii următori, ne-ar plăcea să te ascultăm. Ai putea să acorzi câteva minute pentru a răspunde la cinci întrebări scurte despre experiența ta?"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "Părerea ta sinceră — ce funcționează și ce nu — modelează direct conținutul de rugăciune pe care îl creăm."
              }
            ]
          }
        ]
      }
    }
  },
  "zh": {
    "page": {
      "title": "您的祷告体验",
      "intro": "感谢您与 DOXA 一同祷告。这五个问题大约需要三分钟，您的回答将帮助我们改进每日祷告事项。答案没有对错——我们只想了解您真实的体验。",
      "submit": "提交我的回答",
      "thanksTitle": "谢谢您！",
      "thanks": "谢谢您——我们已收到您的回答。感谢您付出的时间和您的祷告。",
      "editNotice": "您已经回答过了，谢谢您！如有需要，您可以在下方更新答案并重新保存。",
      "invalidTitle": "链接无效",
      "invalid": "此问卷链接似乎无效。请使用您邮件中的链接，如需帮助请与我们联系。",
      "closedTitle": "问卷已关闭",
      "closed": "此问卷已不再接受回答。感谢您的关注。",
      "goHome": "前往主页",
      "errorTitle": "出了点问题",
      "error": "我们无法保存您的回答，请重试。"
    },
    "questions": {
      "focus": {
        "label": "每日祷告事项在多大程度上帮助您专注并投入地为未得之民祷告？",
        "scale": {
          "1": "完全不专注",
          "5": "非常专注"
        }
      },
      "experience": {
        "label": "请进一步分享您的体验：是什么让这些祷告事项对您个人有帮助（或没有帮助）？"
      },
      "clarity": {
        "label": "祷告事项在传达该为何祷告以及为何重要方面有多清晰？",
        "scale": {
          "1": "非常不清晰",
          "5": "非常清晰"
        }
      },
      "content_amount": {
        "label": "祷告内容的数量是否与您的祷告时间相称？",
        "scale": {
          "1": "对我的祷告时间来说太多",
          "3": "刚刚好",
          "5": "对我的祷告时间来说太少"
        }
      },
      "heart": {
        "label": "参与这次祷告行动如何影响了您的心或您对未得之民的看法？"
      }
    },
    "email": {
      "subject": "愿意与我们分享祷告的近况吗？",
      "header": "我们很想听听您的反馈",
      "greeting": "{name}，您好：",
      "greeting_fallback": "您好：",
      "cta": "填写问卷",
      "signoff": "怀着感恩，",
      "team": "DOXA 团队",
      "body": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "感谢您为世界各地的未得之民持续祷告。您的忠心正是 DOXA 致力于支持的核心。"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "我们一直努力让每日祷告事项更有帮助。在团队聚集商讨下一步之前，我们很想听听您的意见。您是否愿意花几分钟回答五个关于您体验的简短问题？"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "您真诚的反馈——哪些有用、哪些无用——将直接塑造我们所编写的祷告内容。"
              }
            ]
          }
        ]
      }
    }
  },
  "hi": {
    "page": {
      "title": "आपका प्रार्थना अनुभव",
      "intro": "DOXA के साथ प्रार्थना करने के लिए धन्यवाद। इन पाँच प्रश्नों में लगभग तीन मिनट लगते हैं, और आपके उत्तर हमें दैनिक प्रार्थना विषयों को बेहतर बनाने में मदद करते हैं। कोई सही या ग़लत उत्तर नहीं है—हम बस आपका सच्चा अनुभव जानना चाहते हैं।",
      "submit": "मेरे उत्तर भेजें",
      "thanksTitle": "धन्यवाद!",
      "thanks": "धन्यवाद—आपके उत्तर मिल गए हैं। आपके समय और आपकी प्रार्थनाओं के लिए हम आभारी हैं।",
      "editNotice": "आप पहले ही उत्तर दे चुके हैं—धन्यवाद! यदि चाहें तो नीचे अपने उत्तर अपडेट करके फिर से सहेज सकते हैं।",
      "invalidTitle": "अमान्य लिंक",
      "invalid": "यह सर्वेक्षण लिंक मान्य नहीं लगता। कृपया अपने ईमेल का लिंक उपयोग करें, या सहायता चाहिए तो हमसे संपर्क करें।",
      "closedTitle": "सर्वेक्षण बंद",
      "closed": "यह सर्वेक्षण अब उत्तर स्वीकार नहीं कर रहा है। आपकी रुचि के लिए धन्यवाद।",
      "goHome": "मुखपृष्ठ पर जाएँ",
      "errorTitle": "कुछ गड़बड़ हो गई",
      "error": "हम आपके उत्तर सहेज नहीं सके। कृपया फिर से प्रयास करें।"
    },
    "questions": {
      "focus": {
        "label": "दैनिक प्रार्थना विषयों ने अगम्य जातीय समूहों के लिए प्रार्थना करने में आपको कितना केंद्रित और संलग्न महसूस कराने में मदद की?",
        "scale": {
          "1": "बिल्कुल भी केंद्रित नहीं",
          "5": "अत्यधिक केंद्रित"
        }
      },
      "experience": {
        "label": "अपने अनुभव के बारे में और बताएँ: किस बात ने इन प्रार्थना विषयों को आपके लिए व्यक्तिगत रूप से उपयोगी (या नहीं) बनाया?"
      },
      "clarity": {
        "label": "प्रार्थना विषयों ने किस बात के लिए और क्यों प्रार्थना करनी है, यह कितनी स्पष्टता से बताया?",
        "scale": {
          "1": "बहुत अस्पष्ट",
          "5": "बहुत स्पष्ट"
        }
      },
      "content_amount": {
        "label": "क्या प्रार्थना सामग्री की मात्रा आपके प्रार्थना के समय के अनुरूप है?",
        "scale": {
          "1": "मेरे प्रार्थना समय के लिए बहुत अधिक",
          "3": "बिल्कुल ठीक",
          "5": "मेरे प्रार्थना समय के लिए बहुत कम"
        }
      },
      "heart": {
        "label": "इस प्रार्थना अभियान में भाग लेने से अगम्य जातीय समूहों के प्रति आपके हृदय या दृष्टिकोण पर क्या प्रभाव पड़ा है?"
      }
    },
    "email": {
      "subject": "क्या आप बताएँगे कि प्रार्थना कैसी चल रही है?",
      "header": "हमें आपकी प्रतिक्रिया जाननी है",
      "greeting": "नमस्ते {name},",
      "greeting_fallback": "नमस्ते,",
      "cta": "सर्वेक्षण भरें",
      "signoff": "कृतज्ञता के साथ,",
      "team": "DOXA टीम",
      "body": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "दुनिया के अगम्य जातीय समूहों के लिए प्रार्थना में खड़े रहने के लिए धन्यवाद। आपकी विश्वसनीयता ही उस कार्य का हृदय है जिसे सहारा देने के लिए DOXA मौजूद है।"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "हम दैनिक प्रार्थना विषयों को और अधिक उपयोगी बनाने का निरंतर प्रयास करते हैं, और आगे की योजना बनाने के लिए टीम के रूप में मिलने से पहले, हम आपसे सुनना चाहेंगे। क्या आप अपने अनुभव के बारे में पाँच छोटे प्रश्नों का उत्तर देने के लिए कुछ मिनट निकालेंगे?"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "आपकी सच्ची प्रतिक्रिया—क्या काम कर रहा है, क्या नहीं—सीधे उस प्रार्थना सामग्री को आकार देती है जिसे हम बनाते हैं।"
              }
            ]
          }
        ]
      }
    }
  },
  "ar": {
    "page": {
      "title": "تجربتك في الصلاة",
      "intro": "شكرًا لصلاتك مع DOXA. تستغرق هذه الأسئلة الخمسة نحو ثلاث دقائق، وإجاباتك تساعدنا على تحسين نقاط الصلاة اليومية. لا توجد إجابات صحيحة أو خاطئة؛ نريد فقط أن نعرف تجربتك الصادقة.",
      "submit": "إرسال إجاباتي",
      "thanksTitle": "شكرًا لك!",
      "thanks": "شكرًا لك — وصلتنا إجاباتك. نحن ممتنّون للوقت الذي خصّصته ولصلواتك.",
      "editNotice": "لقد أجبت بالفعل، شكرًا لك! يمكنك تحديث إجاباتك أدناه وحفظها من جديد إذا أردت.",
      "invalidTitle": "رابط غير صالح",
      "invalid": "لا يبدو رابط الاستبيان صالحًا. يُرجى استخدام الرابط الوارد في بريدك الإلكتروني، أو التواصل معنا إذا احتجت إلى مساعدة.",
      "closedTitle": "أُغلق الاستبيان",
      "closed": "لم يعد هذا الاستبيان يقبل الإجابات. شكرًا لاهتمامك.",
      "goHome": "الذهاب إلى الصفحة الرئيسية",
      "errorTitle": "حدث خطأ ما",
      "error": "تعذّر علينا حفظ إجاباتك. يُرجى المحاولة مرة أخرى."
    },
    "questions": {
      "focus": {
        "label": "إلى أي مدى ساعدتك نقاط الصلاة اليومية على الشعور بالتركيز والانخراط في الصلاة من أجل الجماعات العرقية غير المُبلَّغة؟",
        "scale": {
          "1": "غير مُركّز إطلاقًا",
          "5": "مُركّز للغاية"
        }
      },
      "experience": {
        "label": "أخبرنا المزيد عن تجربتك: ما الذي جعل نقاط الصلاة مفيدة (أو غير مفيدة) لك شخصيًا؟"
      },
      "clarity": {
        "label": "ما مدى وضوح نقاط الصلاة في بيان ما يجب الصلاة من أجله ولماذا هو مهم؟",
        "scale": {
          "1": "غير واضحة جدًا",
          "5": "واضحة جدًا"
        }
      },
      "content_amount": {
        "label": "هل يتناسب حجم محتوى الصلاة مع الوقت المتاح لديك للصلاة؟",
        "scale": {
          "1": "أكثر من اللازم لوقت صلاتي",
          "3": "مناسب تمامًا",
          "5": "أقل من اللازم لوقت صلاتي"
        }
      },
      "heart": {
        "label": "كيف أثّرت مشاركتك في حملة الصلاة هذه على قلبك أو نظرتك تجاه الجماعات العرقية غير المُبلَّغة؟"
      }
    },
    "email": {
      "subject": "هل تشاركنا كيف تسير الصلاة؟",
      "header": "يسعدنا أن نسمع رأيك",
      "greeting": "مرحبًا {name}،",
      "greeting_fallback": "مرحبًا،",
      "cta": "المشاركة في الاستبيان",
      "signoff": "مع خالص الامتنان،",
      "team": "فريق DOXA",
      "body": {
        "type": "doc",
        "content": [
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "شكرًا لوقوفك في الصلاة من أجل الجماعات العرقية غير المُبلَّغة حول العالم. أمانتك هي جوهر ما تسعى DOXA إلى دعمه."
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "نسعى دائمًا لجعل نقاط الصلاة اليومية أكثر فائدة، وقبل أن نجتمع كفريق لنخطّط للخطوات القادمة، يسعدنا أن نسمع منك. هل يمكنك تخصيص بضع دقائق للإجابة عن خمسة أسئلة قصيرة حول تجربتك؟"
              }
            ]
          },
          {
            "type": "paragraph",
            "content": [
              {
                "type": "text",
                "text": "إن رأيك الصادق — ما الذي ينجح وما الذي لا ينجح — يشكّل مباشرةً محتوى الصلاة الذي نُعِدّه."
              }
            ]
          }
        ]
      }
    }
  }
}

export default class DynamicSurveysMigration extends BaseMigration {
  id = 73
  name = 'Add survey_questions + survey_translations and seed may-2026-survey'

  async up(sql) {
    console.log('📥 Adding survey_questions + survey_translations tables...')

    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS survey_questions (
        id SERIAL PRIMARY KEY,
        survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        type TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        UNIQUE (survey_id, key)
      )
    `)
    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_survey_questions_survey ON survey_questions(survey_id, position)')
    console.log('  ✅ survey_questions table ready')

    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS survey_translations (
        id SERIAL PRIMARY KEY,
        survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        language_code TEXT NOT NULL,
        content JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        UNIQUE (survey_id, language_code)
      )
    `)
    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_survey_translations_survey ON survey_translations(survey_id)')
    console.log('  ✅ survey_translations table ready')

    const [survey] = await sql`SELECT id FROM surveys WHERE key = 'may-2026-survey'`
    if (!survey) {
      console.log('  ℹ️  may-2026-survey not found; skipping seed')
      console.log('🎉 Dynamic surveys migration completed!')
      return
    }

    for (const q of QUESTIONS) {
      await sql`
        INSERT INTO survey_questions (survey_id, key, type, position, config)
        VALUES (${survey.id}, ${q.key}, ${q.type}, ${q.position}, ${sql.json(q.config)})
        ON CONFLICT (survey_id, key) DO NOTHING
      `
    }
    console.log(`  ✅ Seeded ${QUESTIONS.length} questions for may-2026-survey`)

    for (const [lang, content] of Object.entries(TRANSLATIONS)) {
      await sql`
        INSERT INTO survey_translations (survey_id, language_code, content)
        VALUES (${survey.id}, ${lang}, ${sql.json(content)})
        ON CONFLICT (survey_id, language_code) DO NOTHING
      `
    }
    console.log(`  ✅ Seeded ${Object.keys(TRANSLATIONS).length} language blobs for may-2026-survey`)

    console.log('🎉 Dynamic surveys migration completed!')
  }

  async down(sql) {
    await this.exec(sql, 'DROP TABLE IF EXISTS survey_translations')
    await this.exec(sql, 'DROP TABLE IF EXISTS survey_questions')
  }
}

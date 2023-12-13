import { Op } from "sequelize";
import { MessageData, SendMessage } from "./helpers/SendMessage";
import Whatsapp from "./models/Whatsapp";
import { logger } from "./utils/logger";
import Contact from "./models/Contact";
import GetDefaultWhatsApp from "./helpers/GetDefaultWhatsApp";

export function startQueueProcess() {
  logger.info("Iniciando processamento de filas");

  const messageQueue = {
    process: async (job: any) => {
      try {
        const { data } = job;
        const whatsapp = await Whatsapp.findByPk(data.whatsappId);

        if (whatsapp == null) {
          throw Error("Whatsapp não identificado");
        }

        const messageData: MessageData = data.data;

        await SendMessage(whatsapp, messageData);
      } catch (e: any) {
        console.log(e);
        logger.error("MessageQueue -> SendMessage: error", e.message);
        throw e;
      }
    }
  };

  const sendScheduledMessages = {
    process: async (job: any) => {
      const {
        data: { schedule }
      } = job;
      let scheduleRecord = null;

      try {
        scheduleRecord = await Schedule.findByPk(schedule.id);
      } catch (e) {
        logger.info(`Erro ao tentar consultar agendamento: ${schedule.id}`);
      }

      try {
        const whatsapp = await GetDefaultWhatsApp();

        await SendMessage(whatsapp, {
          number: schedule.contact.number,
          body: schedule.body
        });

        await scheduleRecord?.update({
          sentAt: moment().format("YYYY-MM-DD HH:mm"),
          status: "ENVIADA"
        });

        logger.info(`Mensagem agendada enviada para: ${schedule.contact.name}`);
        sendScheduledMessages.clean(15000, "completed");
      } catch (e: any) {
        await scheduleRecord?.update({
          status: "ERRO"
        });
        logger.error("SendScheduledMessage -> SendMessage: error", e.message);
        throw e;
      }
    },
    clean: (delay: number, status: string) => {
      // Clean up logic here
    }
  };
}

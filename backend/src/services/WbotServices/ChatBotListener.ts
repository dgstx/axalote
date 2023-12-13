import { Client, Message } from "whatsapp-web.js";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import { Store } from "../../libs/store";
import { getBodyMessage, verifyMessage } from "./wbotMessageListener";
import ShowDialogChatBotsServices from "../DialogChatBotsServices/ShowDialogChatBotsServices";
import ShowQueueService from "../QueueService/ShowQueueService";
import ShowChatBotServices from "../ChatBotServices/ShowChatBotServices";
import DeleteDialogChatBotsServices from "../DialogChatBotsServices/DeleteDialogChatBotsServices";
import ShowChatBotByChatbotIdServices from "../ChatBotServices/ShowChatBotByChatbotIdServices";
import CreateDialogChatBotsServices from "../DialogChatBotsServices/CreateDialogChatBotsServices";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import formatBody from "../../helpers/Mustache";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import Chatbot from "../../models/Chatbot";
import User from "../../models/User";
import Setting from "../../models/Setting";

type Session = Client & {
    id?: number;
    store?: Store;
};

const isNumeric = (value: string) => /^-?\d+$/.test(value);

export const deleteAndCreateDialogStage = async (
    contact: Contact,
    chatbotId: number,
    ticket: Ticket
) => {
    try {
        await DeleteDialogChatBotsServices(contact.id);
        const bots = await ShowChatBotByChatbotIdServices(chatbotId);
        if (!bots) {
            await ticket.update({ isBot: false });
        }
        return await CreateDialogChatBotsServices({
            awaiting: 1,
            contactId: contact.id,
            chatbotId,
            queueId: bots.queueId
        });
    } catch (error) {
        await ticket.update({ isBot: false });
    }
};

const sendMessage = async (
    wbot: Session,
    contact: Contact,
    ticket: Ticket,
    body: string
) => {
    const sentMessage = await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        formatBody(body, contact)
    );
    verifyMessage(sentMessage, ticket, contact);
};

const sendDialog = async (
    choosenQueue: Chatbot,
    wbot: Session,
    contact: Contact,
    ticket: Ticket
) => {
    const showChatBots = await ShowChatBotServices(choosenQueue.id);
    if (showChatBots.options) {
        const botText = async () => {
            let options = "";
            showChatBots.options.forEach((option, index) => {
                options += `*${index + 1}* - ${option.name}\n`;
            });
            const optionsBack =
                options.length > 0
                    ? `${options}\n*#* Voltar para o menu principal`
                    : options;
            if (options.length > 0) {
                const body = `\u200e${choosenQueue.greetingMessage}\n\n${optionsBack}`;
                const sendOption = await sendMessage(wbot, contact, ticket, body);
                return sendOption;
            }
            const body = `\u200e${choosenQueue.greetingMessage}`;
            const send = await sendMessage(wbot, contact, ticket, body);
            return send;
        };
        if (showChatBots.options.length > 0) {
            return await botText();
        }
    }
};

const backToMainMenu = async (
    wbot: Session,
    contact: Contact,
    ticket: Ticket
) => {
    await UpdateTicketService({
        ticketData: { queueId: null },
        ticketId: ticket.id
    });
    const { queues, greetingMessage } = await ShowWhatsAppService(wbot.id!);
    const botText = async () => {
        let options = "";
        queues.forEach((option, index) => {
            options += `*${index + 1}* - ${option.name}\n`;
        });
        const body = formatBody(`\u200e${greetingMessage}\n\n${options}`, contact);
        await sendMessage(wbot, contact, ticket, body);
        const deleteDialog = await DeleteDialogChatBotsServices(contact.id);
        return deleteDialog;
    };
    if (queues.length > 0) {
        return await botText();
    }
};

export const sayChatbot = async (
    queueId: number,
    wbot: Session,
    ticket: Ticket,
    contact: Contact,
    msg: Message
): Promise<any> => {
    const selectedOption =
        msg?.body ||
        getBodyMessage(msg);

    console.log('Selecionado a opção: ', selectedOption);

    if (!queueId && selectedOption && msg.fromMe) return;

    const getStageBot = await ShowDialogChatBotsServices(contact.id);

    if (selectedOption === "#") {
        const backTo = await backToMainMenu(wbot, contact, ticket);
        return backTo;
    }

    if (!getStageBot) {
        const queue = await ShowQueueService(queueId);

        const selectedOption =
            msg?.body ||
            getBodyMessage(msg);

        console.log("!getStageBot", selectedOption);
        const choosenQueue = queue.chatbots[+selectedOption - 1];

        if (!choosenQueue?.greetingMessage) {
            await DeleteDialogChatBotsServices(contact.id);
            return;
        } // nao tem mensagem de boas vindas
        if (choosenQueue) {
            if (choosenQueue.isAgent) {
                try {
                    const getUserByName = await User.findOne({
                        where: {
                            name: choosenQueue.name
                        }
                    });
                    const ticketUpdateAgent = {
                        ticketData: {
                            userId: getUserByName.id,
                            status: "open"
                        },
                        ticketId: ticket.id
                    };
                    await UpdateTicketService(ticketUpdateAgent);
                } catch (error) {
                    await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
                }
            }
            await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
            const send = await sendDialog(choosenQueue, wbot, contact, ticket);
            return send;
        }
    }

    if (getStageBot) {
        const selected = isNumeric(selectedOption) ? selectedOption : 1;
        const bots = await ShowChatBotServices(getStageBot.chatbotId);
        console.log("getStageBot", selected);

        const choosenQueue = bots.options[+selected - 1]
            ? bots.options[+selected - 1]
            : bots.options[0];

        console.log("choosenQueue", choosenQueue);

        if (!choosenQueue.greetingMessage) {
            await DeleteDialogChatBotsServices(contact.id);
            return;
        } // nao tem mensagem de boas vindas
        if (choosenQueue) {
            if (choosenQueue.isAgent) {
                const getUserByName = await User.findOne({
                    where: {
                        name: choosenQueue.name
                    }
                });
                const ticketUpdateAgent = {
                    ticketData: {
                        userId: getUserByName.id,
                        status: "open"
                    },
                    ticketId: ticket.id
                };
                await UpdateTicketService(ticketUpdateAgent);
            }
            await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
            const send = await sendDialog(choosenQueue, wbot, contact, ticket);
            return send;
        }
    }
};

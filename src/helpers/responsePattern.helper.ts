type ServiceRes = {
  data?: object | [];
  message?: string;
};

type badServiceRes = {
  message: string;
};

const badRespObj = ({ message }: badServiceRes) => {
  return { success: false, message };
};
const respObj = ({ data = [], message = "" }: ServiceRes) => {
  return { success: true, data, message };
};

const returnMessage = (message: string) => {
  return { message };
};
const returnData = (data: object | []) => {
  return { data };
};
const returnDataMessage = (data: object | [], message: string) => {
  return { data, message };
};

export { badRespObj, respObj, returnData, returnDataMessage, returnMessage, type ServiceRes };

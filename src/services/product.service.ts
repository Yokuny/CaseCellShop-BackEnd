import { returnData, type ServiceRes } from "../helpers";
import { CustomError } from "../models";
import * as repository from "../repositories/product.repository";

// TODO:Ao buscar o catálogo, buscamos primeiro no cache
export const getCatalog = async (): Promise<ServiceRes> => {
  const products = await repository.findAll();
  return returnData(products);
};

export const getProductById = async (id: string): Promise<ServiceRes> => {
  const product = await repository.findById(id);
  if (!product) throw new CustomError("Produto não encontrado", 404);
  return returnData(product);
};
